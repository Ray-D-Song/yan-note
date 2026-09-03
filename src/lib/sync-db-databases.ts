import { hlcWins, isClockSkew, parseHLC, serializeHLC, type HLC } from './hlc'
import { now, getDatabaseView, defaultPropertyStatements } from './db'
import type { Mutation, MutationAck } from './sync-types'
import {
  insertSyncChange,
  insertSyncChangeIfCellMutation,
  insertSyncChangeIfDatabaseMutation,
  recordAppliedMutation,
  recordAppliedMutationIfCellMutation,
  recordAppliedMutationIfDatabaseMutation,
  touchDatabaseIfCellMutation,
  touchRowIfCellMutation,
} from './sync-db-helpers'
import {
  findAuthorizedCell,
  validateCellEntityId,
  validateDatabaseNoteRef,
} from './sync-auth'

type DbCtx = { db: D1Database; userId: string; serverTime: number }

const CAS_RETRIES = 5

type MutationApplyResult = {
  ack: MutationAck
  statements: D1PreparedStatement[]
  committed?: boolean
}

export async function applyDatabaseMutation(
  ctx: DbCtx,
  mutation: Mutation,
): Promise<MutationApplyResult> {
  const { db, userId, serverTime } = ctx
  const { kind, entity_id: databaseId, clock, changes } = mutation
  const statements: D1PreparedStatement[] = []

  if (isClockSkew(clock, serverTime)) {
    return { ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'CLOCK_SKEW' }, statements: [] }
  }

  const existing = await db
    .prepare('SELECT id, revision, title, title_clock FROM databases WHERE id = ? AND user_id = ?')
    .bind(databaseId, userId)
    .first<{ id: string; revision: number; title: string; title_clock: string | null }>()

  if (kind === 'create') {
    if (existing) {
      const view = await getDatabaseView(db, userId, databaseId)
      return {
        ack: { mutation_id: mutation.mutation_id, result: 'superseded', entity: view as unknown as Record<string, unknown> },
        statements: [],
      }
    }
    const noteId = (changes.note_id as string | null) ?? null
    const noteRef = await validateDatabaseNoteRef(db, userId, noteId)
    if (!noteRef.ok) {
      return { ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: noteRef.reason }, statements: [] }
    }

    const timestamp = serverTime
    const title = (changes.title as string) ?? '新数据库'
    const fieldClock = serializeHLC(clock)
    statements.push(
      db.prepare(
        `INSERT INTO databases (id, user_id, note_id, title, revision, created_at, updated_at, title_clock)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
      ).bind(databaseId, userId, noteId, title, timestamp, timestamp, fieldClock),
    )
    statements.push(...defaultPropertyStatements(db, databaseId))
    statements.push(
      insertSyncChange(db, userId, 'database', databaseId, 1, 'create', {
        title,
        note_id: noteId,
        title_clock: clock,
      }, timestamp),
    )
    const view = await getDatabaseView(db, userId, databaseId)
    return {
      ack: { mutation_id: mutation.mutation_id, result: 'applied', entity: view as unknown as Record<string, unknown> },
      statements,
    }
  }

  if (!existing) {
    return { ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Database not found' }, statements: [] }
  }

  if (kind === 'patch' && changes.title !== undefined) {
    const incomingClock = (changes.title_clock as HLC) ?? clock

    for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
      const row = await db
        .prepare('SELECT revision, title_clock FROM databases WHERE id = ? AND user_id = ?')
        .bind(databaseId, userId)
        .first<{ revision: number; title_clock: string | null }>()
      if (!row) {
        return { ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Database not found' }, statements: [] }
      }
      if (!hlcWins(incomingClock, parseHLC(row.title_clock))) {
        const view = await getDatabaseView(db, userId, databaseId)
        return {
          ack: { mutation_id: mutation.mutation_id, result: 'superseded', entity: view as unknown as Record<string, unknown> },
          statements: [],
        }
      }

      const newRevision = row.revision + 1
      const timestamp = serverTime
      const payload = {
        title: changes.title,
        title_clock: incomingClock,
      }
      const ack: MutationAck = {
        mutation_id: mutation.mutation_id,
        result: 'applied',
      }

      const batch = [
        db
          .prepare(
            `UPDATE databases SET title = ?, title_clock = ?, revision = ?, updated_at = ?, last_mutation_id = ?
             WHERE id = ? AND user_id = ? AND revision = ?`,
          )
          .bind(
            changes.title,
            serializeHLC(incomingClock),
            newRevision,
            timestamp,
            mutation.mutation_id,
            databaseId,
            userId,
            row.revision,
          ),
        insertSyncChangeIfDatabaseMutation(
          db,
          userId,
          databaseId,
          mutation.mutation_id,
          'database',
          databaseId,
          newRevision,
          'patch',
          payload,
          timestamp,
        ),
        recordAppliedMutationIfDatabaseMutation(db, userId, mutation, ack, databaseId, mutation.mutation_id),
      ]

      const results = await db.batch(batch)
      if ((results[0]?.meta?.changes ?? 0) > 0) {
        const view = await getDatabaseView(db, userId, databaseId)
        ack.entity = view as unknown as Record<string, unknown>
        return { ack, statements: [], committed: true }
      }
    }

    const view = await getDatabaseView(db, userId, databaseId)
    return {
      ack: { mutation_id: mutation.mutation_id, result: 'superseded', entity: view as unknown as Record<string, unknown> },
      statements: [],
    }
  }

  return { ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Unsupported database operation' }, statements: [] }
}

export async function applyDatabaseRowMutation(
  ctx: DbCtx,
  mutation: Mutation,
): Promise<MutationApplyResult> {
  const { db, userId, serverTime } = ctx
  const { kind, entity_id: rowId, clock, changes } = mutation
  const databaseId = changes.database_id as string
  const statements: D1PreparedStatement[] = []

  if (isClockSkew(clock, serverTime)) {
    return { ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'CLOCK_SKEW' }, statements: [] }
  }

  const database = await db
    .prepare('SELECT id FROM databases WHERE id = ? AND user_id = ?')
    .bind(databaseId, userId)
    .first()
  if (!database) {
    return { ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Database not found' }, statements: [] }
  }

  if (kind === 'create') {
    const existing = await db
      .prepare(
        `SELECT r.id FROM database_rows r
         INNER JOIN databases d ON d.id = r.database_id AND d.user_id = ?
         WHERE r.id = ? AND r.database_id = ?`,
      )
      .bind(userId, rowId, databaseId)
      .first()
    if (existing) {
      const view = await getDatabaseView(db, userId, databaseId)
      return {
        ack: { mutation_id: mutation.mutation_id, result: 'superseded', entity: view as unknown as Record<string, unknown> },
        statements: [],
      }
    }
    const timestamp = serverTime
    const sortOrder = (changes.sort_order as number) ?? 0
    const properties = await db
      .prepare('SELECT id FROM database_properties WHERE database_id = ? ORDER BY sort_order ASC')
      .bind(databaseId)
      .all<{ id: string }>()

    if ((properties.results ?? []).length === 0) {
      statements.push(...defaultPropertyStatements(db, databaseId))
    }

    const propertyIds =
      (properties.results ?? []).length > 0
        ? (properties.results ?? []).map((p) => p.id)
        : [`${databaseId}-title`, `${databaseId}-status`]

    statements.push(
      db.prepare(
        `INSERT INTO database_rows (id, database_id, sort_order, revision, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      ).bind(rowId, databaseId, sortOrder, timestamp, timestamp),
    )
    for (const propId of propertyIds) {
      const cellClock = serializeHLC(clock)
      statements.push(
        db.prepare(
          `INSERT INTO database_cells (row_id, property_id, value, revision, value_clock) VALUES (?, ?, '', 1, ?)`,
        ).bind(rowId, propId, cellClock),
      )
    }
    statements.push(
      db.prepare('UPDATE databases SET updated_at = ?, revision = revision + 1 WHERE id = ? AND user_id = ?')
        .bind(timestamp, databaseId, userId),
    )
    statements.push(
      insertSyncChange(db, userId, 'database_row', rowId, 1, 'create', { database_id: databaseId, sort_order: sortOrder }, timestamp),
    )
    const view = await getDatabaseView(db, userId, databaseId)
    return {
      ack: { mutation_id: mutation.mutation_id, result: 'applied', entity: view as unknown as Record<string, unknown> },
      statements,
    }
  }

  return { ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Unsupported row operation' }, statements: [] }
}

export async function applyDatabaseCellMutation(
  ctx: DbCtx,
  mutation: Mutation,
): Promise<MutationApplyResult> {
  const { db, userId, serverTime } = ctx
  const { entity_id: cellKey, clock, changes } = mutation

  if (isClockSkew(clock, serverTime)) {
    return { ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'CLOCK_SKEW' }, statements: [] }
  }

  const rowId = changes.row_id as string
  const propertyId = changes.property_id as string
  const value = changes.value as string
  const databaseId = changes.database_id as string
  const incomingClock = (changes.value_clock as HLC) ?? clock

  if (!validateCellEntityId(cellKey, rowId, propertyId)) {
    return {
      ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Invalid cell reference' },
      statements: [],
    }
  }

  const existing = await findAuthorizedCell(db, userId, databaseId, rowId, propertyId)
  if (!existing) {
    return { ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Cell not found' }, statements: [] }
  }

  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    const cell = await findAuthorizedCell(db, userId, databaseId, rowId, propertyId)
    if (!cell) {
      return { ack: { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'Cell not found' }, statements: [] }
    }
    if (!hlcWins(incomingClock, parseHLC(cell.value_clock))) {
      const view = await getDatabaseView(db, userId, databaseId)
      return {
        ack: { mutation_id: mutation.mutation_id, result: 'superseded', entity: view as unknown as Record<string, unknown> },
        statements: [],
      }
    }

    const timestamp = serverTime
    const newRevision = cell.revision + 1
    const payload = {
      row_id: rowId,
      property_id: propertyId,
      value,
      database_id: databaseId,
      value_clock: incomingClock,
    }
    const ack: MutationAck = {
      mutation_id: mutation.mutation_id,
      result: 'applied',
    }

    const batch = [
      db
        .prepare(
          `UPDATE database_cells
           SET value = ?, value_clock = ?, revision = ?, last_mutation_id = ?
           WHERE row_id = ? AND property_id = ? AND revision = ?
           AND EXISTS (
             SELECT 1 FROM database_rows r
             INNER JOIN databases d ON d.id = r.database_id AND d.user_id = ?
             INNER JOIN database_properties p ON p.id = database_cells.property_id AND p.database_id = r.database_id
             WHERE r.id = database_cells.row_id AND r.database_id = ?
           )`,
        )
        .bind(
          value,
          serializeHLC(incomingClock),
          newRevision,
          mutation.mutation_id,
          rowId,
          propertyId,
          cell.revision,
          userId,
          databaseId,
        ),
      touchRowIfCellMutation(db, timestamp, rowId, propertyId, mutation.mutation_id),
      touchDatabaseIfCellMutation(db, userId, timestamp, databaseId, rowId, propertyId, mutation.mutation_id),
      insertSyncChangeIfCellMutation(
        db,
        userId,
        rowId,
        propertyId,
        mutation.mutation_id,
        'database_cell',
        cellKey,
        newRevision,
        'patch',
        payload,
        timestamp,
      ),
      recordAppliedMutationIfCellMutation(
        db,
        userId,
        mutation,
        ack,
        rowId,
        propertyId,
        mutation.mutation_id,
      ),
    ]

    const results = await db.batch(batch)
    if ((results[0]?.meta?.changes ?? 0) > 0) {
      const view = await getDatabaseView(db, userId, databaseId)
      ack.entity = view as unknown as Record<string, unknown>
      return { ack, statements: [], committed: true }
    }
  }

  const view = await getDatabaseView(db, userId, databaseId)
  return {
    ack: { mutation_id: mutation.mutation_id, result: 'superseded', entity: view as unknown as Record<string, unknown> },
    statements: [],
  }
}

export async function listDatabaseViewsForBootstrap(db: D1Database, userId: string) {
  const list = await db
    .prepare('SELECT id FROM databases WHERE user_id = ?')
    .bind(userId)
    .all<{ id: string }>()
  const views = []
  for (const row of list.results ?? []) {
    const view = await getDatabaseView(db, userId, row.id)
    if (view) views.push(view)
  }
  return views
}
