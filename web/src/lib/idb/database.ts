import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { LocalAsset, LocalDatabase, LocalNote, OutboxEntry, SyncMeta } from '@/lib/sync/types'
import { dbNameForUser } from '@/lib/sync/device-id'
import { replayAllPendingOutbox } from '@/lib/sync/apply-local'

export type YanNoteDB = DBSchema & {
  notes: {
    key: string
    value: LocalNote
    indexes: { 'by-parent': string | null; 'by-position': string }
  }
  assets: {
    key: string
    value: LocalAsset
  }
  outbox: {
    key: string
    value: OutboxEntry
    indexes: { 'by-entity': [EntityType, string]; 'by-status': string }
  }
  syncMeta: {
    key: string
    value: SyncMeta
  }
  databases: {
    key: string
    value: LocalDatabase
  }
}

type EntityType = OutboxEntry['entity_type']

const DB_VERSION = 2

let currentDb: IDBPDatabase<YanNoteDB> | null = null
let currentUserId: string | null = null

export async function openAccountDb(userId: string): Promise<IDBPDatabase<YanNoteDB>> {
  if (currentDb && currentUserId === userId) {
    return currentDb
  }
  if (currentDb) {
    currentDb.close()
  }

  currentDb = await openDB<YanNoteDB>(dbNameForUser(userId), DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' })
        notes.createIndex('by-parent', 'parent_id')
        notes.createIndex('by-position', 'position_key')
        db.createObjectStore('assets', { keyPath: 'id' })
        const outbox = db.createObjectStore('outbox', { keyPath: 'mutation_id' })
        outbox.createIndex('by-entity', ['entity_type', 'entity_id'])
        outbox.createIndex('by-status', 'status')
        db.createObjectStore('syncMeta', { keyPath: 'key' })
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains('databases')) {
        db.createObjectStore('databases', { keyPath: 'id' })
      }
    },
  })
  currentUserId = userId
  return currentDb
}

export async function closeAccountDb() {
  if (currentDb) {
    currentDb.close()
    currentDb = null
    currentUserId = null
  }
}

export async function deleteAccountDb(userId: string) {
  await closeAccountDb()
  await indexedDB.deleteDatabase(dbNameForUser(userId))
}

export async function getSyncMeta(db: IDBPDatabase<YanNoteDB>): Promise<SyncMeta | null> {
  return (await db.get('syncMeta', 'meta')) ?? null
}

export async function putSyncMeta(db: IDBPDatabase<YanNoteDB>, meta: Omit<SyncMeta, 'key'>) {
  await db.put('syncMeta', { ...meta, key: 'meta' })
}

export async function listLocalNotes(db: IDBPDatabase<YanNoteDB>): Promise<LocalNote[]> {
  const all = await db.getAll('notes')
  return all.filter((n) => n.deleted_at === null)
}

export async function getLocalNote(
  db: IDBPDatabase<YanNoteDB>,
  id: string,
): Promise<LocalNote | undefined> {
  return db.get('notes', id)
}

export async function listTrashNotes(db: IDBPDatabase<YanNoteDB>): Promise<LocalNote[]> {
  const all = await db.getAll('notes')
  return all.filter((n) => n.deleted_at !== null)
}

export async function getPendingOutbox(db: IDBPDatabase<YanNoteDB>): Promise<OutboxEntry[]> {
  const all = await db.getAll('outbox')
  return all
    .filter((e) => e.status === 'pending' || e.status === 'sending')
    .sort((a, b) => a.created_at - b.created_at)
}

export async function markOutboxSending(
  db: IDBPDatabase<YanNoteDB>,
  mutationIds: string[],
) {
  const tx = db.transaction('outbox', 'readwrite')
  for (const id of mutationIds) {
    const entry = await tx.store.get(id)
    if (entry) {
      entry.status = 'sending'
      await tx.store.put(entry)
    }
  }
  await tx.done
}

export async function removeOutboxEntries(
  db: IDBPDatabase<YanNoteDB>,
  mutationIds: string[],
) {
  const tx = db.transaction('outbox', 'readwrite')
  for (const id of mutationIds) {
    await tx.store.delete(id)
  }
  await tx.done
}

export async function resetSendingOutbox(db: IDBPDatabase<YanNoteDB>) {
  const tx = db.transaction('outbox', 'readwrite')
  const all = await tx.store.getAll()
  for (const entry of all) {
    if (entry.status === 'sending') {
      entry.status = 'pending'
      await tx.store.put(entry)
    }
  }
  await tx.done
}

export type LocalWritePayload = {
  note?: LocalNote
  outbox?: OutboxEntry
  asset?: LocalAsset
  database?: LocalDatabase
}

export async function commitLocalWrite(
  db: IDBPDatabase<YanNoteDB>,
  payload: LocalWritePayload,
): Promise<void> {
  const stores: Array<'notes' | 'outbox' | 'assets' | 'databases'> = []
  if (payload.note) stores.push('notes')
  if (payload.outbox) stores.push('outbox')
  if (payload.asset) stores.push('assets')
  if (payload.database) stores.push('databases')

  const tx = db.transaction(stores, 'readwrite')

  let outboxEntry = payload.outbox
  if (outboxEntry && outboxEntry.status === 'pending') {
    const existing = await tx.objectStore('outbox').index('by-entity').getAll([
      outboxEntry.entity_type,
      outboxEntry.entity_id,
    ])
    const pending = existing.find((e) => e.status === 'pending' && e.kind === outboxEntry!.kind)
    if (pending) {
      outboxEntry = {
        ...pending,
        changes: { ...pending.changes, ...outboxEntry.changes },
        base_revision: outboxEntry.base_revision,
        clock: outboxEntry.clock,
      }
    }
  }

  if (payload.note) {
    await tx.objectStore('notes').put(payload.note)
  }
  if (outboxEntry) {
    await tx.objectStore('outbox').put(outboxEntry)
  }
  if (payload.asset) {
    await tx.objectStore('assets').put(payload.asset)
  }
  if (payload.database) {
    await tx.objectStore('databases').put(payload.database)
  }

  await tx.done
}

export async function commitLocalDeleteWithOutbox(
  db: IDBPDatabase<YanNoteDB>,
  noteId: string,
  outbox: OutboxEntry,
): Promise<void> {
  const tx = db.transaction(['notes', 'outbox'], 'readwrite')
  await tx.objectStore('notes').delete(noteId)
  await tx.objectStore('outbox').put(outbox)
  await tx.done
}

export async function updateOutboxEntry(
  db: IDBPDatabase<YanNoteDB>,
  entry: OutboxEntry,
): Promise<void> {
  await db.put('outbox', entry)
}

export async function getLocalDatabase(db: IDBPDatabase<YanNoteDB>, id: string) {
  return db.get('databases', id)
}

export async function listLocalDatabases(db: IDBPDatabase<YanNoteDB>) {
  return db.getAll('databases')
}

export async function applyRemoteDatabase(db: IDBPDatabase<YanNoteDB>, database: LocalDatabase) {
  await db.put('databases', database)
}

export async function getPendingAssets(db: IDBPDatabase<YanNoteDB>) {
  const all = await db.getAll('assets')
  return all.filter((a) => !a.uploaded)
}

export async function applyBootstrap(
  db: IDBPDatabase<YanNoteDB>,
  notes: LocalNote[],
  databases: LocalDatabase[],
  meta: Omit<SyncMeta, 'key'>,
) {
  const tx = db.transaction(['notes', 'databases', 'syncMeta'], 'readwrite')
  await tx.objectStore('notes').clear()
  await tx.objectStore('databases').clear()
  for (const note of notes) {
    await tx.objectStore('notes').put(note)
  }
  for (const database of databases) {
    await tx.objectStore('databases').put(database)
  }
  await tx.objectStore('syncMeta').put({ ...meta, key: 'meta' as const })
  await tx.done

  await replayAllPendingOutbox(db)
}

export async function applyRemoteNote(
  db: IDBPDatabase<YanNoteDB>,
  note: LocalNote,
) {
  await db.put('notes', note)
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage?.persist) {
    return navigator.storage.persist()
  }
  return false
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) {
    return null
  }
  const est = await navigator.storage.estimate()
  return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
}
