import {
  commitLocalWrite,
  getLocalDatabase,
  listLocalDatabases,
  openAccountDb,
} from '@/lib/idb/database'
import { createOutboxEntry, getClientClock, scheduleSync } from '@/lib/sync/engine'
import type { LocalDatabase, LocalDatabaseRow } from '@/lib/sync/types'
import { emptyCellMaps, parseDatabaseRow, parseMaybeHLCField } from '@/lib/database-row-utils'
import type { Database, DatabaseRow } from '@/types/database'

function parseDatabase(raw: Record<string, unknown>): LocalDatabase {
  return {
    id: raw.id as string,
    note_id: (raw.note_id as string | null) ?? null,
    title: (raw.title as string) ?? '新数据库',
    revision: (raw.revision as number) ?? 1,
    updated_at: (raw.updated_at as number) ?? Date.now(),
    created_at: (raw.created_at as number) ?? Date.now(),
    title_clock: parseMaybeHLCField(raw.title_clock),
    properties: (raw.properties as LocalDatabase['properties']) ?? [],
    rows: ((raw.rows as Array<Record<string, unknown>>) ?? []).map(parseDatabaseRow),
  }
}

export function toDatabaseView(local: LocalDatabase): Database {
  return {
    id: local.id,
    note_id: local.note_id,
    title: local.title,
    updated_at: local.updated_at,
    properties: local.properties,
    rows: local.rows as DatabaseRow[],
  }
}

export async function loadDatabaseFromLocal(userId: string, id: string) {
  const db = await openAccountDb(userId)
  const local = await getLocalDatabase(db, id)
  return local ? toDatabaseView(local) : null
}

export async function loadAllDatabasesFromLocal(userId: string) {
  const db = await openAccountDb(userId)
  const all = await listLocalDatabases(db)
  return all.map(toDatabaseView)
}

export async function createDatabaseLocal(
  userId: string,
  payload: { id?: string; title?: string; note_id?: string | null },
) {
  const db = await openAccountDb(userId)
  const id = payload.id ?? crypto.randomUUID()
  const timestamp = Date.now()
  const clock = getClientClock().now()
  const database: LocalDatabase = {
    id,
    note_id: payload.note_id ?? null,
    title: payload.title ?? '新数据库',
    revision: 1,
    created_at: timestamp,
    updated_at: timestamp,
    title_clock: clock,
    properties: [
      { id: `${id}-title`, name: '名称', type: 'text', sort_order: 0 },
      { id: `${id}-status`, name: '状态', type: 'text', sort_order: 1 },
    ],
    rows: [],
  }
  const outbox = createOutboxEntry('database', id, 'create', 0, {
    title: database.title,
    note_id: database.note_id,
  })
  await commitLocalWrite(db, { database, outbox })
  scheduleSync(userId)
  return toDatabaseView(database)
}

export async function createRowLocal(userId: string, databaseId: string) {
  const db = await openAccountDb(userId)
  const database = await getLocalDatabase(db, databaseId)
  if (!database) throw new Error('Database not found')

  const rowId = crypto.randomUUID()
  const sortOrder = database.rows.length
  const cells: Record<string, string> = {}
  const { cell_revisions, cell_clocks } = emptyCellMaps(database.properties.map((p) => p.id))
  for (const prop of database.properties) {
    cells[prop.id] = ''
  }
  database.rows.push({ id: rowId, sort_order: sortOrder, revision: 1, cells, cell_revisions, cell_clocks })
  database.updated_at = Date.now()

  const outbox = createOutboxEntry('database_row', rowId, 'create', 0, {
    database_id: databaseId,
    sort_order: sortOrder,
  })
  await commitLocalWrite(db, { database, outbox })
  scheduleSync(userId)
  return database.rows[database.rows.length - 1]!
}

export async function updateCellLocal(
  userId: string,
  databaseId: string,
  rowId: string,
  propertyId: string,
  value: string,
) {
  const db = await openAccountDb(userId)
  const database = await getLocalDatabase(db, databaseId)
  if (!database) throw new Error('Database not found')

  const row = database.rows.find((r) => r.id === rowId)
  if (!row) throw new Error('Row not found')

  const clock = getClientClock().now()
  row.cells[propertyId] = value
  row.cell_revisions[propertyId] = (row.cell_revisions[propertyId] ?? 1) + 1
  row.cell_clocks[propertyId] = clock
  database.updated_at = Date.now()
  const cellKey = `${rowId}:${propertyId}`

  const outbox = createOutboxEntry('database_cell', cellKey, 'patch', 1, {
    database_id: databaseId,
    row_id: rowId,
    property_id: propertyId,
    value,
    value_clock: clock,
  })
  await commitLocalWrite(db, { database, outbox })
  scheduleSync(userId)
}

export function parseDatabaseEntity(raw: Record<string, unknown>): LocalDatabase {
  return parseDatabase(raw)
}
