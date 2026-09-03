import {
  createHLC,
  hlcWins,
  isClockSkew,
  parseHLC,
  serializeHLC,
  type HLC,
} from './hlc'
import { now, getDatabaseView } from './db'
import {
  CHANGE_LOG_RETENTION_MS,
  MAX_CHANGES_PER_RESPONSE,
  NOTE_VERSION_MAX_COUNT,
  NOTE_VERSION_RETENTION_MS,
  type BootstrapSnapshot,
  type EntityType,
  type Mutation,
  type MutationAck,
  type MutationKind,
  type NoteSnapshot,
  type SyncChange,
} from './sync-types'
import {
  applyDatabaseCellMutation,
  applyDatabaseMutation,
  applyDatabaseRowMutation,
  listDatabaseViewsForBootstrap,
} from './sync-db-databases'
import { validateNoteParent } from './sync-auth'
import {
  deleteDeletedSubtreeIfRootMutation,
  deletePurgeRootIfRootMutation,
  getUserTreeLock,
  incrementUserTreeLockIfMatch,
  insertMoveChangesForReparentedIfRootMutation,
  insertPurgeChangesForDeletedSubtreeIfRootMutation,
  insertSyncChange,
  insertSoftDeleteChangesForSubtreeIfRootMutation,
  insertSyncChangeIfNoteMutation,
  recordAppliedMutation,
  recordAppliedMutationIfNoteMutation,
  recordPurgedEntitiesForDeletedSubtreeIfRootMutation,
  reparentActiveSubtreeIfRootMutation,
  saveNoteVersionIfNoteMutation,
  softDeleteSubtreeDescendantsIfRootMutation,
  deleteOldNoteVersionsIfNoteMutation,
  trimNoteVersionsIfNoteMutation,
} from './sync-db-helpers'

const CAS_RETRIES = 5

const NOTE_FIELD_CLOCKS = ['title', 'content', 'icon'] as const

type MutationApplyResult = {
  ack: MutationAck
  statements: D1PreparedStatement[]
  committed?: boolean
}

type NoteRow = {
  id: string
  user_id: string
  parent_id: string | null
  title: string
  content: string
  icon: string | null
  sort_order: number
  position_key: string
  revision: number
  created_at: number
  updated_at: number
  deleted_at: number | null
  purged_at: number | null
  title_clock: string | null
  content_clock: string | null
  icon_clock: string | null
  parent_clock: string | null
  position_clock: string | null
}

function noteRowToSnapshot(row: NoteRow): NoteSnapshot {
  return {
    id: row.id,
    parent_id: row.parent_id,
    title: row.title,
    content: row.content,
    icon: row.icon,
    position_key: row.position_key,
    revision: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    title_clock: parseHLC(row.title_clock),
    content_clock: parseHLC(row.content_clock),
    icon_clock: parseHLC(row.icon_clock),
    parent_clock: parseHLC(row.parent_clock),
    position_clock: parseHLC(row.position_clock),
  }
}

function getFieldClock(row: NoteRow, field: string): HLC | null {
  switch (field) {
    case 'title':
      return parseHLC(row.title_clock)
    case 'content':
      return parseHLC(row.content_clock)
    case 'icon':
      return parseHLC(row.icon_clock)
    case 'parent_id':
      return parseHLC(row.parent_clock)
    case 'position_key':
      return parseHLC(row.position_clock)
    default:
      return null
  }
}

async function getMaxSeq(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(MAX(seq), 0) AS max_seq FROM sync_changes WHERE user_id = ?')
    .bind(userId)
    .first<{ max_seq: number }>()
  return row?.max_seq ?? 0
}

async function getMinAvailableSeq(db: D1Database, userId: string): Promise<number> {
  const cutoff = now() - CHANGE_LOG_RETENTION_MS
  const row = await db
    .prepare(
      'SELECT COALESCE(MIN(seq), 0) AS min_seq FROM sync_changes WHERE user_id = ? AND created_at >= ?',
    )
    .bind(userId, cutoff)
    .first<{ min_seq: number }>()
  return row?.min_seq ?? 0
}

async function purgeExpiredChanges(db: D1Database, userId: string): Promise<void> {
  const cutoff = now() - CHANGE_LOG_RETENTION_MS
  await db.prepare('DELETE FROM sync_changes WHERE user_id = ? AND created_at < ?').bind(userId, cutoff).run()
  await db.prepare('DELETE FROM applied_mutations WHERE user_id = ? AND created_at < ?').bind(userId, cutoff).run()
}

export async function getBootstrapSnapshot(
  db: D1Database,
  userId: string,
): Promise<BootstrapSnapshot> {
  await purgeExpiredChanges(db, userId)
  const cursor = await getMaxSeq(db, userId)

  const notesResult = await db
    .prepare(
      `SELECT id, user_id, parent_id, title, content, icon, sort_order, position_key,
              revision, created_at, updated_at, deleted_at, purged_at,
              title_clock, content_clock, icon_clock, parent_clock, position_clock
       FROM notes
       WHERE user_id = ? AND purged_at IS NULL`,
    )
    .bind(userId)
    .all<NoteRow>()

  const databaseViews = await listDatabaseViewsForBootstrap(db, userId)

  return {
    notes: (notesResult.results ?? []).map(noteRowToSnapshot),
    databases: databaseViews as unknown as Array<Record<string, unknown>>,
    cursor,
    server_time: now(),
  }
}

export async function getChangesSince(
  db: D1Database,
  userId: string,
  cursor: number,
  limit = MAX_CHANGES_PER_RESPONSE,
): Promise<{ changes: SyncChange[]; has_more: boolean; min_seq: number }> {
  const minSeq = await getMinAvailableSeq(db, userId)
  if (cursor > 0 && cursor < minSeq) {
    return { changes: [], has_more: false, min_seq: minSeq }
  }

  const result = await db
    .prepare(
      `SELECT seq, entity_type, entity_id, revision, operation, payload, created_at
       FROM sync_changes
       WHERE user_id = ? AND seq > ?
       ORDER BY seq ASC
       LIMIT ?`,
    )
    .bind(userId, cursor, limit + 1)
    .all<{
      seq: number
      entity_type: EntityType
      entity_id: string
      revision: number
      operation: string
      payload: string
      created_at: number
    }>()

  const rows = result.results ?? []
  const has_more = rows.length > limit
  const slice = has_more ? rows.slice(0, limit) : rows

  return {
    changes: slice.map((row) => ({
      seq: row.seq,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      revision: row.revision,
      operation: row.operation,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
      created_at: row.created_at,
    })),
    has_more,
    min_seq: minSeq,
  }
}

async function isPurged(
  db: D1Database,
  userId: string,
  entityType: EntityType,
  entityId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT 1 FROM purged_entities WHERE user_id = ? AND entity_type = ? AND entity_id = ?',
    )
    .bind(userId, entityType, entityId)
    .first()
  return row !== null
}

async function findAppliedMutation(
  db: D1Database,
  userId: string,
  mutationId: string,
): Promise<MutationAck | null> {
  const row = await db
    .prepare('SELECT result, response FROM applied_mutations WHERE user_id = ? AND mutation_id = ?')
    .bind(userId, mutationId)
    .first<{ result: string; response: string }>()
  if (!row) {
    return null
  }
  return JSON.parse(row.response) as MutationAck
}

async function saveNoteVersion(
  db: D1Database,
  userId: string,
  note: NoteRow,
  fieldName: string,
  deviceId: string,
  mutationId: string,
): Promise<D1PreparedStatement> {
  const versionId = crypto.randomUUID()
  const snapshot = JSON.stringify({
    title: note.title,
    content: note.content,
    icon: note.icon,
    parent_id: note.parent_id,
    position_key: note.position_key,
    revision: note.revision,
  })

  return saveNoteVersionIfNoteMutation(
    db,
    userId,
    note.id,
    mutationId,
    versionId,
    note.revision,
    snapshot,
    deviceId,
    fieldName,
    now(),
  )
}

async function findNote(
  db: D1Database,
  userId: string,
  noteId: string,
): Promise<NoteRow | null> {
  return db
    .prepare(
      `SELECT id, user_id, parent_id, title, content, icon, sort_order, position_key,
              revision, created_at, updated_at, deleted_at, purged_at,
              title_clock, content_clock, icon_clock, parent_clock, position_clock
       FROM notes
       WHERE id = ? AND user_id = ?`,
    )
    .bind(noteId, userId)
    .first<NoteRow>()
}

async function listActiveNoteParents(
  db: D1Database,
  userId: string,
): Promise<Array<{ id: string; parent_id: string | null }>> {
  const result = await db
    .prepare('SELECT id, parent_id FROM notes WHERE user_id = ? AND deleted_at IS NULL AND purged_at IS NULL')
    .bind(userId)
    .all<{ id: string; parent_id: string | null }>()
  return result.results ?? []
}

function isDescendantOf(
  notes: Array<{ id: string; parent_id: string | null }>,
  ancestorId: string,
  nodeId: string,
): boolean {
  const parentById = new Map(notes.map((n) => [n.id, n.parent_id]))
  const visited = new Set<string>()
  let current: string | null | undefined = nodeId
  while (current) {
    if (current === ancestorId) {
      return true
    }
    if (visited.has(current)) {
      return false
    }
    visited.add(current)
    current = parentById.get(current) ?? null
  }
  return false
}

function collectDescendantIds(
  notes: Array<{ id: string; parent_id: string | null }>,
  rootId: string,
): string[] {
  const childrenByParent = new Map<string | null, string[]>()
  for (const note of notes) {
    const siblings = childrenByParent.get(note.parent_id) ?? []
    siblings.push(note.id)
    childrenByParent.set(note.parent_id, siblings)
  }
  const ids: string[] = []
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    ids.push(current)
    const children = childrenByParent.get(current) ?? []
    queue.push(...children)
  }
  return ids
}

async function applyNoteMutation(
  db: D1Database,
  userId: string,
  mutation: Mutation,
  serverTime: number,
): Promise<MutationApplyResult> {
  const statements: D1PreparedStatement[] = []
  const { kind, entity_id: noteId, clock, changes, base_revision: baseRevision } = mutation

  if (await isPurged(db, userId, 'note', noteId)) {
    return {
      ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Entity purged' },
      statements: [],
    }
  }

  if (isClockSkew(clock, serverTime)) {
    return {
      ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'CLOCK_SKEW' },
      statements: [],
    }
  }

  let note = await findNote(db, userId, noteId)

  if (kind === 'create') {
    if (note) {
      return {
        ack: {
          mutation_id: mutation.mutation_id,
          result: 'superseded',
          entity: noteRowToSnapshot(note) as unknown as Record<string, unknown>,
        },
        statements: [],
      }
    }

    const timestamp = serverTime
    const title = (changes.title as string) ?? '无标题'
    const content = (changes.content as string) ?? ''
    const icon = (changes.icon as string | null) ?? null
    const parentId = (changes.parent_id as string | null) ?? null
    const parentCheck = await validateNoteParent(db, userId, parentId, noteId)
    if (!parentCheck.ok) {
      return {
        ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: parentCheck.reason },
        statements: [],
      }
    }
    const positionKey = (changes.position_key as string) ?? 'a0'
    const fieldClock = serializeHLC(clock)

    statements.push(
      db
        .prepare(
          `INSERT INTO notes
           (id, user_id, parent_id, title, content, icon, sort_order, position_key,
            revision, created_at, updated_at, title_clock, content_clock, icon_clock,
            parent_clock, position_clock)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          noteId,
          userId,
          parentId,
          title,
          content,
          icon,
          positionKey,
          timestamp,
          timestamp,
          fieldClock,
          fieldClock,
          fieldClock,
          fieldClock,
          fieldClock,
        ),
    )
    statements.push(
      insertSyncChange(db, userId, 'note', noteId, 1, 'create', {
        ...changes,
        revision: 1,
      }, timestamp),
    )

    const createdSnapshot = {
      id: noteId,
      parent_id: parentId,
      title,
      content,
      icon,
      position_key: positionKey,
      revision: 1,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
      title_clock: clock,
      content_clock: clock,
      icon_clock: clock,
      parent_clock: clock,
      position_clock: clock,
    }

    return {
      ack: {
        mutation_id: mutation.mutation_id,
        result: 'applied',
        entity: createdSnapshot as unknown as Record<string, unknown>,
      },
      statements,
    }
  }

  if (!note) {
    return {
      ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Note not found' },
      statements: [],
    }
  }

  if (kind === 'soft_delete') {
    for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
      const current = await findNote(db, userId, noteId)
      if (!current) {
        return {
          ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Note not found' },
          statements: [],
        }
      }
      if (current.deleted_at) {
        return {
          ack: {
            mutation_id: mutation.mutation_id,
            result: 'superseded',
            entity: noteRowToSnapshot(current) as unknown as Record<string, unknown>,
          },
          statements: [],
        }
      }
      if (baseRevision > 0 && current.revision !== baseRevision) {
        return {
          ack: {
            mutation_id: mutation.mutation_id,
            result: 'superseded',
            entity: noteRowToSnapshot(current) as unknown as Record<string, unknown>,
          },
          statements: [],
        }
      }

      const timestamp = serverTime
      const newRevision = current.revision + 1
      const treeLock = await getUserTreeLock(db, userId)
      const ack: MutationAck = {
        mutation_id: mutation.mutation_id,
        result: 'applied',
      }

      const batch: D1PreparedStatement[] = [
        incrementUserTreeLockIfMatch(db, userId, treeLock),
        db
          .prepare(
            `UPDATE notes SET deleted_at = ?, updated_at = ?, revision = ?, last_mutation_id = ?
             WHERE id = ? AND user_id = ? AND revision = ? AND deleted_at IS NULL
             AND EXISTS (SELECT 1 FROM users WHERE id = ? AND note_tree_lock = ?)`,
          )
          .bind(
            timestamp,
            timestamp,
            newRevision,
            mutation.mutation_id,
            noteId,
            userId,
            current.revision,
            userId,
            treeLock + 1,
          ),
        softDeleteSubtreeDescendantsIfRootMutation(
          db,
          userId,
          noteId,
          mutation.mutation_id,
          timestamp,
          treeLock + 1,
        ),
        insertSoftDeleteChangesForSubtreeIfRootMutation(
          db,
          userId,
          noteId,
          mutation.mutation_id,
          timestamp,
        ),
        recordAppliedMutationIfNoteMutation(db, userId, mutation, ack, noteId, mutation.mutation_id),
      ]

      const results = await db.batch(batch)
      const lockOk = (results[0]?.meta?.changes ?? 0) > 0
      const rootOk = (results[1]?.meta?.changes ?? 0) > 0
      if (lockOk && rootOk) {
        const deleted = await findNote(db, userId, noteId)
        ack.entity = noteRowToSnapshot(deleted!) as unknown as Record<string, unknown>
        return { ack, statements: [], committed: true }
      }
    }

    const stale = await findNote(db, userId, noteId)
    return {
      ack: {
        mutation_id: mutation.mutation_id,
        result: 'superseded',
        entity: stale ? (noteRowToSnapshot(stale) as unknown as Record<string, unknown>) : undefined,
      },
      statements: [],
    }
  }

  if (kind === 'restore') {
    for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
      const current = await findNote(db, userId, noteId)
      if (!current) {
        return {
          ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Note not found' },
          statements: [],
        }
      }
      if (!current.deleted_at) {
        return {
          ack: {
            mutation_id: mutation.mutation_id,
            result: 'superseded',
            entity: noteRowToSnapshot(current) as unknown as Record<string, unknown>,
          },
          statements: [],
        }
      }
      if (baseRevision > 0 && current.revision !== baseRevision) {
        return {
          ack: {
            mutation_id: mutation.mutation_id,
            result: 'superseded',
            entity: noteRowToSnapshot(current) as unknown as Record<string, unknown>,
          },
          statements: [],
        }
      }

      const timestamp = serverTime
      const newRevision = current.revision + 1
      const treeLock = await getUserTreeLock(db, userId)
      const ack: MutationAck = {
        mutation_id: mutation.mutation_id,
        result: 'applied',
      }

      const batch = [
        incrementUserTreeLockIfMatch(db, userId, treeLock),
        db
          .prepare(
            `UPDATE notes SET deleted_at = NULL, updated_at = ?, revision = ?, last_mutation_id = ?
             WHERE id = ? AND user_id = ? AND revision = ? AND deleted_at IS NOT NULL
             AND EXISTS (SELECT 1 FROM users WHERE id = ? AND note_tree_lock = ?)`,
          )
          .bind(
            timestamp,
            newRevision,
            mutation.mutation_id,
            noteId,
            userId,
            current.revision,
            userId,
            treeLock + 1,
          ),
        insertSyncChangeIfNoteMutation(
          db,
          userId,
          noteId,
          mutation.mutation_id,
          'note',
          noteId,
          newRevision,
          'restore',
          {},
          timestamp,
        ),
        recordAppliedMutationIfNoteMutation(db, userId, mutation, ack, noteId, mutation.mutation_id),
      ]

      const results = await db.batch(batch)
      const lockOk = (results[0]?.meta?.changes ?? 0) > 0
      const restoreOk = (results[1]?.meta?.changes ?? 0) > 0
      if (lockOk && restoreOk) {
        const restored = await findNote(db, userId, noteId)
        ack.entity = noteRowToSnapshot(restored!) as unknown as Record<string, unknown>
        return { ack, statements: [], committed: true }
      }
    }

    const stale = await findNote(db, userId, noteId)
    return {
      ack: {
        mutation_id: mutation.mutation_id,
        result: 'superseded',
        entity: stale ? (noteRowToSnapshot(stale) as unknown as Record<string, unknown>) : undefined,
      },
      statements: [],
    }
  }

  if (kind === 'purge') {
    for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
      const current = await findNote(db, userId, noteId)
      if (!current) {
        if (await isPurged(db, userId, 'note', noteId)) {
          return {
            ack: { mutation_id: mutation.mutation_id, result: 'superseded' },
            statements: [],
          }
        }
        return {
          ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Note not found' },
          statements: [],
        }
      }
      if (!current.deleted_at) {
        return {
          ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Note is not in trash' },
          statements: [],
        }
      }
      if (baseRevision > 0 && current.revision !== baseRevision) {
        return {
          ack: {
            mutation_id: mutation.mutation_id,
            result: 'superseded',
            entity: noteRowToSnapshot(current) as unknown as Record<string, unknown>,
          },
          statements: [],
        }
      }

      const timestamp = serverTime
      const treeLock = await getUserTreeLock(db, userId)
      const ack: MutationAck = {
        mutation_id: mutation.mutation_id,
        result: 'applied',
      }

      const batch: D1PreparedStatement[] = [
        incrementUserTreeLockIfMatch(db, userId, treeLock),
        db
          .prepare(
            `UPDATE notes SET last_mutation_id = ?, updated_at = ?
             WHERE id = ? AND user_id = ? AND revision = ? AND deleted_at IS NOT NULL
             AND EXISTS (SELECT 1 FROM users WHERE id = ? AND note_tree_lock = ?)`,
          )
          .bind(
            mutation.mutation_id,
            timestamp,
            noteId,
            userId,
            current.revision,
            userId,
            treeLock + 1,
          ),
        reparentActiveSubtreeIfRootMutation(
          db,
          userId,
          noteId,
          mutation.mutation_id,
          timestamp,
          treeLock + 1,
        ),
        insertMoveChangesForReparentedIfRootMutation(db, userId, noteId, mutation.mutation_id, timestamp),
        insertPurgeChangesForDeletedSubtreeIfRootMutation(db, userId, noteId, mutation.mutation_id, timestamp),
        recordPurgedEntitiesForDeletedSubtreeIfRootMutation(db, userId, noteId, mutation.mutation_id, timestamp),
        recordAppliedMutationIfNoteMutation(db, userId, mutation, ack, noteId, mutation.mutation_id),
        deleteDeletedSubtreeIfRootMutation(db, userId, noteId, mutation.mutation_id),
        deletePurgeRootIfRootMutation(db, userId, noteId, mutation.mutation_id),
      ]

      const results = await db.batch(batch)
      const lockOk = (results[0]?.meta?.changes ?? 0) > 0
      const rootStampOk = (results[1]?.meta?.changes ?? 0) > 0
      const rootDeleted = (results[8]?.meta?.changes ?? 0) > 0
      if (lockOk && rootStampOk && rootDeleted) {
        return { ack, statements: [], committed: true }
      }
    }

    if (await isPurged(db, userId, 'note', noteId)) {
      return {
        ack: { mutation_id: mutation.mutation_id, result: 'superseded' },
        statements: [],
      }
    }

    const stale = await findNote(db, userId, noteId)
    return {
      ack: {
        mutation_id: mutation.mutation_id,
        result: 'superseded',
        entity: stale ? (noteRowToSnapshot(stale) as unknown as Record<string, unknown>) : undefined,
      },
      statements: [],
    }
  }

  if (kind === 'move') {
    const parentId = changes.parent_id as string | null
    const positionKey = changes.position_key as string

    if (parentId === noteId) {
      return {
        ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Cannot be own parent' },
        statements: [],
      }
    }

    const moveClock = (changes.position_clock as HLC) ?? clock
    const parentClock = (changes.parent_clock as HLC) ?? clock

    for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
      const current = await findNote(db, userId, noteId)
      if (!current) {
        return {
          ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Note not found' },
          statements: [],
        }
      }

      const activeNotes = await listActiveNoteParents(db, userId)
      if (parentId && isDescendantOf(activeNotes, noteId, parentId)) {
        return {
          ack: {
            mutation_id: mutation.mutation_id,
            result: 'rejected',
            reason: 'Circular parent',
            entity: noteRowToSnapshot(current) as unknown as Record<string, unknown>,
          },
          statements: [],
        }
      }

      if (parentId) {
        const parent = await findNote(db, userId, parentId)
        if (!parent || parent.deleted_at) {
          return {
            ack: {
              mutation_id: mutation.mutation_id,
              result: 'rejected',
              reason: 'Invalid parent',
              entity: noteRowToSnapshot(current) as unknown as Record<string, unknown>,
            },
            statements: [],
          }
        }
      }

      const existingPosClock = getFieldClock(current, 'position_key')
      const existingParentClock = getFieldClock(current, 'parent_id')
      const posWins = hlcWins(moveClock, existingPosClock)
      const parentWins = hlcWins(parentClock, existingParentClock)

      if (!posWins && !parentWins) {
        return {
          ack: {
            mutation_id: mutation.mutation_id,
            result: 'superseded',
            entity: noteRowToSnapshot(current) as unknown as Record<string, unknown>,
          },
          statements: [],
        }
      }

      const timestamp = serverTime
      const newRevision = current.revision + 1
      const nextParent = parentWins ? parentId : current.parent_id
      const nextPosition = posWins ? positionKey : current.position_key
      const payload = {
        parent_id: nextParent,
        position_key: nextPosition,
        parent_clock: parentWins ? parentClock : parseHLC(current.parent_clock),
        position_clock: posWins ? moveClock : parseHLC(current.position_clock),
      }

      const ack: MutationAck = {
        mutation_id: mutation.mutation_id,
        result: 'applied',
      }

      const treeLock = await getUserTreeLock(db, userId)

      const batch = [
        incrementUserTreeLockIfMatch(db, userId, treeLock),
        db
          .prepare(
            `UPDATE notes SET parent_id = ?, position_key = ?, parent_clock = ?, position_clock = ?,
             updated_at = ?, revision = ?, last_mutation_id = ?
             WHERE id = ? AND user_id = ? AND revision = ?
             AND EXISTS (SELECT 1 FROM users WHERE id = ? AND note_tree_lock = ?)`,
          )
          .bind(
            nextParent,
            nextPosition,
            parentWins ? serializeHLC(parentClock) : current.parent_clock,
            posWins ? serializeHLC(moveClock) : current.position_clock,
            timestamp,
            newRevision,
            mutation.mutation_id,
            noteId,
            userId,
            current.revision,
            userId,
            treeLock + 1,
          ),
        insertSyncChangeIfNoteMutation(
          db,
          userId,
          noteId,
          mutation.mutation_id,
          'note',
          noteId,
          newRevision,
          'move',
          payload,
          timestamp,
        ),
        recordAppliedMutationIfNoteMutation(db, userId, mutation, ack, noteId, mutation.mutation_id),
      ]

      const results = await db.batch(batch)
      const updateOk =
        (results[0]?.meta?.changes ?? 0) > 0 && (results[1]?.meta?.changes ?? 0) > 0
      if (updateOk) {
        const moved = await findNote(db, userId, noteId)
        ack.entity = noteRowToSnapshot(moved!) as unknown as Record<string, unknown>
        return { ack, statements: [], committed: true }
      }
    }

    const stale = await findNote(db, userId, noteId)
    return {
      ack: {
        mutation_id: mutation.mutation_id,
        result: 'superseded',
        entity: noteRowToSnapshot(stale!) as unknown as Record<string, unknown>,
      },
      statements: [],
    }
  }

  if (kind === 'patch' && ('parent_id' in changes || 'position_key' in changes)) {
    return {
      ack: {
        mutation_id: mutation.mutation_id,
        result: 'rejected',
        reason: 'Use move for hierarchy changes',
      },
      statements: [],
    }
  }

  // patch — CAS per attempt
  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    note = await findNote(db, userId, noteId)
    if (!note) {
      return {
        ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Note not found' },
        statements: [],
      }
    }

    const timestamp = serverTime
    const expectedRevision = note.revision
    const newRevision = expectedRevision + 1
    const updates: Record<string, unknown> = {}
    const setClauses: string[] = []
    const bindValues: unknown[] = []
    let shouldSaveVersion = false

    for (const field of NOTE_FIELD_CLOCKS) {
      if (!(field in changes)) {
        continue
      }

      const incomingClock = (changes[`${field}_clock`] as HLC) ?? clock
      const existingClock = getFieldClock(note, field)

      if (!hlcWins(incomingClock, existingClock)) {
        continue
      }

      const newValue = changes[field]
      const oldValue =
        field === 'title' ? note.title : field === 'content' ? note.content : note.icon

      if (newValue === oldValue) {
        continue
      }

      if (field === 'title' || field === 'content') {
        shouldSaveVersion = Boolean(oldValue)
      }

      setClauses.push(`${field} = ?`)
      bindValues.push(newValue)
      setClauses.push(`${field}_clock = ?`)
      bindValues.push(serializeHLC(incomingClock))
      updates[field] = newValue
      updates[`${field}_clock`] = incomingClock
    }

    if (setClauses.length === 0) {
      return {
        ack: {
          mutation_id: mutation.mutation_id,
          result: 'superseded',
          entity: noteRowToSnapshot(note) as unknown as Record<string, unknown>,
        },
        statements: [],
      }
    }

    setClauses.push('updated_at = ?', 'revision = ?', 'last_mutation_id = ?')
    bindValues.push(timestamp, newRevision, mutation.mutation_id, noteId, userId, expectedRevision)

    const ack: MutationAck = {
      mutation_id: mutation.mutation_id,
      result: 'applied',
    }

    const batch: D1PreparedStatement[] = [
      db
        .prepare(`UPDATE notes SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? AND revision = ?`)
        .bind(...bindValues),
      insertSyncChangeIfNoteMutation(
        db,
        userId,
        noteId,
        mutation.mutation_id,
        'note',
        noteId,
        newRevision,
        'patch',
        updates,
        timestamp,
      ),
      recordAppliedMutationIfNoteMutation(db, userId, mutation, ack, noteId, mutation.mutation_id),
    ]

    if (shouldSaveVersion) {
      batch.splice(
        1,
        0,
        await saveNoteVersion(db, userId, note, 'patch', mutation.device_id, mutation.mutation_id),
      )
      batch.push(
        trimNoteVersionsIfNoteMutation(db, noteId, mutation.mutation_id, NOTE_VERSION_MAX_COUNT),
      )
      batch.push(
        deleteOldNoteVersionsIfNoteMutation(
          db,
          noteId,
          mutation.mutation_id,
          now() - NOTE_VERSION_RETENTION_MS,
        ),
      )
    }

    const results = await db.batch(batch)
    const updateOk = (results[0]?.meta?.changes ?? 0) > 0
    if (updateOk) {
      const updated = await findNote(db, userId, noteId)
      ack.entity = noteRowToSnapshot(updated!) as unknown as Record<string, unknown>
      return { ack, statements: [], committed: true }
    }
  }

  const finalNote = await findNote(db, userId, noteId)
  return {
    ack: {
      mutation_id: mutation.mutation_id,
      result: 'superseded',
      entity: noteRowToSnapshot(finalNote!) as unknown as Record<string, unknown>,
    },
    statements: [],
  }
}

export async function applyMutations(
  db: D1Database,
  userId: string,
  mutations: Mutation[],
): Promise<{ acks: MutationAck[]; error?: string }> {
  const serverTime = now()
  const acks: MutationAck[] = []

  for (const mutation of mutations) {
    const existing = await findAppliedMutation(db, userId, mutation.mutation_id)
    if (existing) {
      acks.push(existing)
      continue
    }

    let result: MutationApplyResult

    if (mutation.entity_type === 'note') {
      result = await applyNoteMutation(db, userId, mutation, serverTime)
    } else if (mutation.entity_type === 'database') {
      result = await applyDatabaseMutation({ db, userId, serverTime }, mutation)
    } else if (mutation.entity_type === 'database_row') {
      result = await applyDatabaseRowMutation({ db, userId, serverTime }, mutation)
    } else if (mutation.entity_type === 'database_cell') {
      result = await applyDatabaseCellMutation({ db, userId, serverTime }, mutation)
    } else {
      result = {
        ack: {
          mutation_id: mutation.mutation_id,
          result: 'rejected',
          reason: `Unsupported entity type: ${mutation.entity_type}`,
        },
        statements: [],
      }
    }

    if (!result.committed) {
      const alreadyRecorded = await findAppliedMutation(db, userId, mutation.mutation_id)
      if (!alreadyRecorded) {
        const batch = [...result.statements, recordAppliedMutation(db, userId, mutation, result.ack)]
        if (batch.length > 0) {
          await db.batch(batch)
        }
      }
    }

    if (result.ack.result === 'applied' && mutation.entity_type === 'note') {
      const refreshed = await findNote(db, userId, mutation.entity_id)
      if (refreshed) {
        result.ack.entity = noteRowToSnapshot(refreshed) as unknown as Record<string, unknown>
      }
    }

    if (
      result.ack.result === 'applied' &&
      (mutation.entity_type === 'database' ||
        mutation.entity_type === 'database_row' ||
        mutation.entity_type === 'database_cell')
    ) {
      const databaseId =
        mutation.entity_type === 'database'
          ? mutation.entity_id
          : (mutation.changes.database_id as string)
      const view = await getDatabaseView(db, userId, databaseId)
      if (view) {
        result.ack.entity = view as unknown as Record<string, unknown>
      }
    }

    acks.push(result.ack)
  }

  return { acks }
}

export async function listNoteVersions(
  db: D1Database,
  userId: string,
  noteId: string,
): Promise<Array<{ id: string; revision: number; field_name: string; device_id: string; created_at: number }>> {
  const note = await findNote(db, userId, noteId)
  if (!note) {
    return []
  }

  const result = await db
    .prepare(
      `SELECT id, revision, field_name, device_id, created_at
       FROM note_versions
       WHERE note_id = ? AND user_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
    )
    .bind(noteId, userId)
    .all<{ id: string; revision: number; field_name: string; device_id: string; created_at: number }>()

  return result.results ?? []
}

export async function getNoteVersion(
  db: D1Database,
  userId: string,
  noteId: string,
  versionId: string,
): Promise<{ id: string; note_id: string; revision: number; snapshot: Record<string, unknown>; field_name: string; device_id: string; created_at: number } | null> {
  const row = await db
    .prepare(
      `SELECT id, note_id, revision, snapshot, field_name, device_id, created_at
       FROM note_versions
       WHERE id = ? AND user_id = ? AND note_id = ?`,
    )
    .bind(versionId, userId, noteId)
    .first<{ id: string; note_id: string; revision: number; snapshot: string; field_name: string; device_id: string; created_at: number }>()

  if (!row) {
    return null
  }

  return {
    ...row,
    snapshot: JSON.parse(row.snapshot) as Record<string, unknown>,
  }
}

export function createServerMutation(
  deviceId: string,
  entityType: EntityType,
  entityId: string,
  kind: MutationKind,
  changes: Record<string, unknown>,
  baseRevision = 0,
): Mutation {
  const serverTime = now()
  const clock = createHLC(serverTime, deviceId, null)
  return {
    mutation_id: crypto.randomUUID(),
    device_id: deviceId,
    entity_type: entityType,
    entity_id: entityId,
    kind,
    base_revision: baseRevision,
    clock,
    changes,
  }
}

export async function writeLegacyNoteChange(
  db: D1Database,
  userId: string,
  noteId: string,
  operation: MutationKind,
  payload: Record<string, unknown>,
): Promise<void> {
  const note = await findNote(db, userId, noteId)
  if (!note) {
    return
  }
  const timestamp = now()
  await db.batch([
    insertSyncChange(db, userId, 'note', noteId, note.revision, operation, payload, timestamp),
  ])
}

export { getMaxSeq, getMinAvailableSeq, noteRowToSnapshot, findNote }
