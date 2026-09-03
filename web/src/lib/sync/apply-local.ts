import type { IDBPDatabase } from 'idb'
import type { YanNoteDB } from '@/lib/idb/database'
import { getPendingOutbox } from '@/lib/idb/database'
import { emptyCellMaps } from '@/lib/database-row-utils'
import type { LocalDatabase, LocalNote, OutboxEntry } from '@/lib/sync/types'
import { rebaselineMutationClocks } from '../../../../shared/hlc'

export async function applyOutboxEntryLocally(
  db: IDBPDatabase<YanNoteDB>,
  entry: OutboxEntry,
): Promise<void> {
  if (entry.entity_type === 'note') {
    await applyNoteOutboxEntry(db, entry)
    return
  }

  if (entry.entity_type === 'database') {
    await applyDatabaseOutboxEntry(db, entry)
    return
  }

  if (entry.entity_type === 'database_row') {
    await applyDatabaseRowOutboxEntry(db, entry)
    return
  }

  if (entry.entity_type === 'database_cell') {
    await applyDatabaseCellOutboxEntry(db, entry)
  }
}

export async function replayAllPendingOutbox(db: IDBPDatabase<YanNoteDB>): Promise<void> {
  const pending = (await getPendingOutbox(db)).sort((a, b) => a.created_at - b.created_at)
  for (const entry of pending) {
    await applyOutboxEntryLocally(db, entry)
  }
}

async function applyNoteOutboxEntry(db: IDBPDatabase<YanNoteDB>, entry: OutboxEntry) {
  let note = await db.get('notes', entry.entity_id)
  if (entry.kind === 'create') {
    if (note) return
    const clock = entry.clock
    note = {
      id: entry.entity_id,
      parent_id: (entry.changes.parent_id as string | null) ?? null,
      title: (entry.changes.title as string) ?? '无标题',
      content: (entry.changes.content as string) ?? '',
      icon: (entry.changes.icon as string | null) ?? null,
      position_key: (entry.changes.position_key as string) ?? 'a0',
      revision: 1,
      created_at: entry.created_at,
      updated_at: entry.created_at,
      deleted_at: null,
      title_clock: (entry.changes.title_clock as LocalNote['title_clock']) ?? clock,
      content_clock: (entry.changes.content_clock as LocalNote['content_clock']) ?? clock,
      icon_clock: (entry.changes.icon_clock as LocalNote['icon_clock']) ?? clock,
      parent_clock: (entry.changes.parent_clock as LocalNote['parent_clock']) ?? clock,
      position_clock: (entry.changes.position_clock as LocalNote['position_clock']) ?? clock,
    }
    await db.put('notes', note)
    return
  }

  if (!note) return

  if (entry.kind === 'patch') {
    applyNotePatchFields(note, entry.changes, entry.clock)
  } else if (entry.kind === 'move') {
    if (entry.changes.parent_id !== undefined) {
      note.parent_id = entry.changes.parent_id as string | null
      note.parent_clock = (entry.changes.parent_clock as LocalNote['parent_clock']) ?? entry.clock
    }
    if (entry.changes.position_key !== undefined) {
      note.position_key = entry.changes.position_key as string
      note.position_clock = (entry.changes.position_clock as LocalNote['position_clock']) ?? entry.clock
    }
  } else if (entry.kind === 'soft_delete') {
    note.deleted_at = entry.created_at
  } else if (entry.kind === 'restore') {
    note.deleted_at = null
  } else if (entry.kind === 'purge') {
    await db.delete('notes', entry.entity_id)
    return
  }

  note.updated_at = entry.created_at
  await db.put('notes', note)
}

async function applyDatabaseOutboxEntry(db: IDBPDatabase<YanNoteDB>, entry: OutboxEntry) {
  let database = await db.get('databases', entry.entity_id)
  if (entry.kind === 'create') {
    if (database) return
    const id = entry.entity_id
    database = {
      id,
      note_id: (entry.changes.note_id as string | null) ?? null,
      title: (entry.changes.title as string) ?? '新数据库',
      revision: 1,
      created_at: entry.created_at,
      updated_at: entry.created_at,
      title_clock: entry.clock,
      properties: [
        { id: `${id}-title`, name: '名称', type: 'text', sort_order: 0 },
        { id: `${id}-status`, name: '状态', type: 'text', sort_order: 1 },
      ],
      rows: [],
    }
    await db.put('databases', database)
    return
  }

  if (!database || entry.kind !== 'patch') return

  if (entry.changes.title !== undefined) {
    database.title = entry.changes.title as string
    database.title_clock = (entry.changes.title_clock as LocalDatabase['title_clock']) ?? entry.clock
    database.revision = (database.revision ?? 1) + 1
    database.updated_at = entry.created_at
    await db.put('databases', database)
  }
}

async function applyDatabaseRowOutboxEntry(db: IDBPDatabase<YanNoteDB>, entry: OutboxEntry) {
  const databaseId = entry.changes.database_id as string
  const database = await db.get('databases', databaseId)
  if (!database || entry.kind !== 'create') return

  const rowId = entry.entity_id
  if (database.rows.some((r) => r.id === rowId)) return

  const cells: Record<string, string> = {}
  const { cell_revisions, cell_clocks } = emptyCellMaps(database.properties.map((p) => p.id))
  for (const prop of database.properties) {
    cells[prop.id] = ''
  }

  database.rows.push({
    id: rowId,
    sort_order: (entry.changes.sort_order as number) ?? database.rows.length,
    revision: 1,
    cells,
    cell_revisions,
    cell_clocks,
  })
  database.revision = (database.revision ?? 1) + 1
  database.updated_at = entry.created_at
  await db.put('databases', database)
}

async function applyDatabaseCellOutboxEntry(db: IDBPDatabase<YanNoteDB>, entry: OutboxEntry) {
  const databaseId = entry.changes.database_id as string
  const database = await db.get('databases', databaseId)
  if (!database || entry.kind !== 'patch') return

  const rowId = entry.changes.row_id as string
  const propertyId = entry.changes.property_id as string
  const row = database.rows.find((r) => r.id === rowId)
  if (!row) return

  row.cells[propertyId] = entry.changes.value as string
  row.cell_revisions[propertyId] = (row.cell_revisions[propertyId] ?? 1) + 1
  row.cell_clocks[propertyId] =
    (entry.changes.value_clock as LocalDatabase['rows'][number]['cell_clocks'][string]) ?? entry.clock
  database.revision = (database.revision ?? 1) + 1
  database.updated_at = entry.created_at
  await db.put('databases', database)
}

function applyNotePatchFields(
  note: LocalNote,
  changes: Record<string, unknown>,
  fallbackClock: OutboxEntry['clock'],
) {
  if (changes.title !== undefined) {
    note.title = changes.title as string
    note.title_clock = (changes.title_clock as LocalNote['title_clock']) ?? fallbackClock
  }
  if (changes.content !== undefined) {
    note.content = changes.content as string
    note.content_clock = (changes.content_clock as LocalNote['content_clock']) ?? fallbackClock
  }
  if (changes.icon !== undefined) {
    note.icon = changes.icon as string | null
    note.icon_clock = (changes.icon_clock as LocalNote['icon_clock']) ?? fallbackClock
  }
}

export function rebaselineOutboxEntry(entry: OutboxEntry, serverTimeMs: number): OutboxEntry {
  const rebased = rebaselineMutationClocks(entry.clock, entry.changes, serverTimeMs)
  return {
    ...entry,
    clock: rebased.clock,
    changes: rebased.changes,
    status: 'pending',
  }
}
