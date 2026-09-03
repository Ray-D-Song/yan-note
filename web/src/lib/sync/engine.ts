import { apiRequest, ApiError } from '@/api/client'
import {
  applyBootstrap,
  applyRemoteDatabase,
  applyRemoteNote,
  getPendingAssets,
  getPendingOutbox,
  getSyncMeta,
  markOutboxSending,
  openAccountDb,
  putSyncMeta,
  removeOutboxEntries,
  resetSendingOutbox,
  updateOutboxEntry,
  type YanNoteDB,
} from '@/lib/idb/database'
import { rebaselineOutboxEntry, replayAllPendingOutbox } from '@/lib/sync/apply-local'
import { parseDatabaseEntity } from '@/lib/local-databases'
import { markAssetUploaded } from '@/lib/asset-store'
import { emptyCellMaps } from '@/lib/database-row-utils'
import { ClientClock } from '@/lib/sync/hlc'
import { getDeviceId } from '@/lib/sync/device-id'
import {
  mergeRemoteDatabaseCell,
  mergeRemoteDatabaseTitle,
  mergeRemoteNote,
} from '@/lib/sync/merge'
import { isPermanentRejection } from '../../../../shared/sync-errors'
import type {
  BootstrapSnapshot,
  LocalDatabase,
  LocalNote,
  Mutation,
  MutationAck,
  OutboxEntry,
  SyncChange,
  SyncMeta,
  SyncResponse,
} from '@/lib/sync/types'
import {
  IDLE_PULL_MS,
  SCHEDULE_DEBOUNCE_MS,
  shouldScheduleSync,
  type SyncScheduleReason,
} from '@/lib/sync/sync-scheduler'
import type { IDBPDatabase } from 'idb'

const SYNC_LOCK_NAME = 'yan-note-sync'
const SYNC_CHANNEL = 'yan-note-sync'
const SYNC_INTERVAL_MS = IDLE_PULL_MS

type SyncListener = () => void
type SyncStateListener = (state: { error?: string | null; syncing?: boolean }) => void

let syncTimer: number | null = null
let syncInterval: number | null = null
let syncing = false
let clock: ClientClock | null = null
let activeUserId: string | null = null
const listeners = new Set<SyncListener>()
const stateListeners = new Set<SyncStateListener>()

let lastSyncAttemptAt = 0

const onlineHandler = () => {
  if (activeUserId) scheduleSync(activeUserId, { reason: 'online' })
}
const focusHandler = () => {
  if (activeUserId) scheduleSync(activeUserId, { reason: 'focus' })
}
const visibilityHandler = () => {
  if (document.visibilityState === 'visible' && activeUserId) {
    scheduleSync(activeUserId, { reason: 'visibility' })
  }
}

const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(SYNC_CHANNEL) : null

if (channel) {
  channel.onmessage = () => {
    notifyListeners()
  }
}

function notifyListeners() {
  for (const fn of listeners) {
    fn()
  }
}

export function onSyncDataChanged(fn: SyncListener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function onSyncStateChanged(fn: SyncStateListener) {
  stateListeners.add(fn)
  return () => stateListeners.delete(fn)
}

function emitSyncState(state: { error?: string | null; syncing?: boolean }) {
  for (const fn of stateListeners) {
    fn(state)
  }
}

function broadcastChange() {
  channel?.postMessage({ type: 'data-changed' })
  notifyListeners()
}

function parseNoteEntity(raw: Record<string, unknown>): LocalNote {
  return {
    id: raw.id as string,
    parent_id: (raw.parent_id as string | null) ?? null,
    title: (raw.title as string) ?? '无标题',
    content: (raw.content as string) ?? '',
    icon: (raw.icon as string | null) ?? null,
    position_key: (raw.position_key as string) ?? 'a0',
    revision: (raw.revision as number) ?? 1,
    created_at: (raw.created_at as number) ?? Date.now(),
    updated_at: (raw.updated_at as number) ?? Date.now(),
    deleted_at: (raw.deleted_at as number | null) ?? null,
    title_clock: (raw.title_clock as LocalNote['title_clock']) ?? null,
    content_clock: (raw.content_clock as LocalNote['content_clock']) ?? null,
    icon_clock: (raw.icon_clock as LocalNote['icon_clock']) ?? null,
    parent_clock: (raw.parent_clock as LocalNote['parent_clock']) ?? null,
    position_clock: (raw.position_clock as LocalNote['position_clock']) ?? null,
  }
}

async function applyChanges(db: IDBPDatabase<YanNoteDB>, changes: SyncChange[]) {
  const pendingAll = await getPendingOutbox(db)
  for (const change of changes) {
    const payload = change.payload

    if (change.entity_type === 'database' && change.operation === 'create') {
      const id = change.entity_id
      const local: LocalDatabase = {
        id,
        note_id: (payload.note_id as string | null) ?? null,
        title: (payload.title as string) ?? '新数据库',
        revision: change.revision,
        created_at: change.created_at,
        updated_at: change.created_at,
        title_clock: (payload.title_clock as LocalDatabase['title_clock']) ?? null,
        properties: [
          { id: `${id}-title`, name: '名称', type: 'text', sort_order: 0 },
          { id: `${id}-status`, name: '状态', type: 'text', sort_order: 1 },
        ],
        rows: [],
      }
      await applyRemoteDatabase(db, local)
      continue
    }

    if (change.entity_type === 'database' && change.operation === 'patch') {
      const existing = await db.get('databases', change.entity_id)
      if (existing) {
        const pending = pendingAll.filter((e) => e.entity_type === 'database' && e.entity_id === change.entity_id)
        const merged = mergeRemoteDatabaseTitle(existing, payload, change.revision, pending)
        merged.updated_at = change.created_at
        await applyRemoteDatabase(db, merged)
      }
      continue
    }

    if (change.entity_type === 'database_row' && change.operation === 'create') {
      const databaseId = payload.database_id as string
      const existing = await db.get('databases', databaseId)
      if (!existing) continue
      const rowId = change.entity_id
      if (existing.rows.some((r) => r.id === rowId)) continue
      const cells: Record<string, string> = {}
      const { cell_revisions, cell_clocks } = emptyCellMaps(existing.properties.map((p) => p.id))
      for (const prop of existing.properties) cells[prop.id] = ''
      existing.rows.push({
        id: rowId,
        sort_order: (payload.sort_order as number) ?? existing.rows.length,
        revision: change.revision,
        cells,
        cell_revisions,
        cell_clocks,
      })
      existing.updated_at = change.created_at
      await applyRemoteDatabase(db, existing)
      continue
    }

    if (change.entity_type === 'database_cell' && change.operation === 'patch') {
      const databaseId = payload.database_id as string
      const existing = await db.get('databases', databaseId)
      if (!existing) continue
      const cellKey = change.entity_id
      const pending = pendingAll.filter((e) => e.entity_type === 'database_cell' && e.entity_id === cellKey)
      const merged = mergeRemoteDatabaseCell(existing, payload, change.revision, pending)
      merged.updated_at = change.created_at
      await applyRemoteDatabase(db, merged)
      continue
    }

    if (
      change.entity_type === 'database' ||
      change.entity_type === 'database_row' ||
      change.entity_type === 'database_cell'
    ) {
      if (payload.view) {
        await applyRemoteDatabase(db, parseDatabaseEntity(payload.view as Record<string, unknown>))
      }
      continue
    }

    if (change.entity_type !== 'note') {
      continue
    }
    if (change.operation === 'purge') {
      await db.delete('notes', change.entity_id)
      continue
    }
    if (change.operation === 'soft_delete') {
      const note = await db.get('notes', change.entity_id)
      const revisions = payload.revisions as Record<string, number> | undefined
      const ids = (payload.ids as string[]) ?? [change.entity_id]
      for (const id of ids) {
        const n = id === change.entity_id && note ? note : await db.get('notes', id)
        if (n) {
          n.deleted_at = change.created_at
          n.revision = revisions?.[id] ?? (id === change.entity_id ? change.revision : n.revision + 1)
          await applyRemoteNote(db, n)
        }
      }
      continue
    }
    if (change.operation === 'restore') {
      const note = await db.get('notes', change.entity_id)
      if (note) {
        note.deleted_at = null
        note.revision = change.revision
        await applyRemoteNote(db, note)
      }
      continue
    }
    const existing = await db.get('notes', change.entity_id)
    const pending = pendingAll.filter((e) => e.entity_type === 'note' && e.entity_id === change.entity_id)
    if (existing) {
      const merged = mergeRemoteNote(existing, payload, change.revision, pending)
      await applyRemoteNote(db, merged)
    } else if (payload.id || change.entity_id) {
      await applyRemoteNote(db, parseNoteEntity({ id: change.entity_id, ...payload, revision: change.revision }))
    }
  }
}

async function applyAckEntity(db: IDBPDatabase<YanNoteDB>, ack: MutationAck) {
  if (!ack.entity) return
  if (ack.entity.properties !== undefined) {
    await applyRemoteDatabase(db, parseDatabaseEntity(ack.entity))
  } else {
    await applyRemoteNote(db, parseNoteEntity(ack.entity))
  }
}

async function processAcks(
  db: IDBPDatabase<YanNoteDB>,
  acks: MutationAck[],
  sentEntries: OutboxEntry[],
  serverTime: number,
) {
  const appliedIds: string[] = []
  const removedIds: string[] = []

  for (const ack of acks) {
    const entry = sentEntries.find((e) => e.mutation_id === ack.mutation_id)
    if (ack.result === 'applied' || ack.result === 'superseded') {
      appliedIds.push(ack.mutation_id)
      if (ack.entity) {
        await applyAckEntity(db, ack)
      }
      continue
    }

    if (ack.result === 'rejected') {
      if (ack.reason === 'CLOCK_SKEW' && entry) {
        await updateOutboxEntry(db, rebaselineOutboxEntry(entry, serverTime))
        if (clock) clock.rebaseline(serverTime)
        continue
      }
      if (ack.entity) {
        await applyAckEntity(db, ack)
      }
      if (isPermanentRejection(ack.reason)) {
        removedIds.push(ack.mutation_id)
      }
    }
  }

  const toRemove = [...new Set([...appliedIds, ...removedIds])]
  if (toRemove.length > 0) {
    await removeOutboxEntries(db, toRemove)
  }

  await replayAllPendingOutbox(db)

  const retriableFailed = sentEntries.filter(
    (e) => !toRemove.includes(e.mutation_id),
  )
  if (retriableFailed.length > 0) {
    await resetSendingOutbox(db)
  }
}

export async function bootstrapAccount(userId: string): Promise<void> {
  const db = await openAccountDb(userId)
  const deviceId = getDeviceId()
  clock = new ClientClock(deviceId)

  const snapshot = await apiRequest<BootstrapSnapshot>('/sync/bootstrap')
  clock.updateServerTime(snapshot.server_time)

  const meta: Omit<SyncMeta, 'key'> = {
    cursor: snapshot.cursor,
    server_time_offset: clock.offset,
    last_sync_at: Date.now(),
    bootstrap_complete: true,
    device_id: deviceId,
  }

  const databases = snapshot.databases.map((d) => parseDatabaseEntity(d))

  await applyBootstrap(db, snapshot.notes, databases, meta)
  broadcastChange()
}

async function syncPendingAssets(userId: string) {
  const db = await openAccountDb(userId)
  const pending = await getPendingAssets(db)
  for (const asset of pending) {
    try {
      const response = await fetch(`/api/v1/uploads/${encodeURIComponent(asset.id)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': asset.blob.type || 'application/octet-stream',
          'X-Content-Hash': asset.content_hash ?? '',
        },
        body: asset.blob,
      })
      if (response.ok) {
        await markAssetUploaded(db, asset.id)
      }
    } catch {
      // retry later
    }
  }
}

function registerBackgroundSync(userId: string) {
  if (!('serviceWorker' in navigator)) {
    return
  }
  const syncManager = (navigator.serviceWorker.ready as Promise<ServiceWorkerRegistration & {
    sync?: { register: (tag: string) => Promise<void> }
  }>)
  void syncManager.then((reg) => reg.sync?.register(`yan-note-sync-${userId}`)).catch(() => {})
}

const MAX_MUTATIONS = 100

export async function runSync(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (syncing || !navigator.onLine) {
    return { ok: false, error: 'offline_or_busy' }
  }

  lastSyncAttemptAt = Date.now()

  const run = async (): Promise<{ ok: boolean; error?: string }> => {
    syncing = true
    emitSyncState({ syncing: true, error: null })
    try {
      const db = await openAccountDb(userId)
      let meta = await getSyncMeta(db)

      if (!meta?.bootstrap_complete) {
        await bootstrapAccount(userId)
        meta = await getSyncMeta(db)
      }

      if (!meta) {
        return { ok: false, error: 'no_meta' }
      }

      if (!clock) {
        clock = new ClientClock(meta.device_id)
        clock.updateServerTime(Date.now() + meta.server_time_offset)
      }

      await resetSendingOutbox(db)
      await syncPendingAssets(userId)
      const outbox = await getPendingOutbox(db)
      const batch = outbox.slice(0, MAX_MUTATIONS)
      const mutations: Mutation[] = batch.map((e) => ({
        mutation_id: e.mutation_id,
        device_id: e.device_id,
        entity_type: e.entity_type,
        entity_id: e.entity_id,
        kind: e.kind,
        base_revision: e.base_revision,
        clock: e.clock,
        changes: e.changes,
      }))

      if (mutations.length > 0) {
        await markOutboxSending(db, mutations.map((m) => m.mutation_id))
      }

      let cursor = meta.cursor
      let hasMore = true

      while (hasMore) {
        let response: SyncResponse
        try {
          response = await apiRequest<SyncResponse>('/sync', {
            method: 'POST',
            body: JSON.stringify({
              device_id: meta.device_id,
              cursor,
              mutations: cursor === meta.cursor ? mutations : [],
            }),
          })
        } catch (err) {
          await resetSendingOutbox(db)
          if (err instanceof ApiError && err.status === 401) {
            emitSyncState({ error: 'auth_required', syncing: false })
            return { ok: false, error: 'auth_required' }
          }
          if (err instanceof ApiError && err.message.includes('REBOOTSTRAP')) {
            await bootstrapAccount(userId)
            emitSyncState({ syncing: false })
            return { ok: true }
          }
          emitSyncState({ error: 'network', syncing: false })
          return { ok: false, error: 'network' }
        }

        clock.updateServerTime(response.server_time)

        if (cursor === meta.cursor && batch.length > 0) {
          await processAcks(db, response.acks, batch, response.server_time)
        }

        if (response.changes.length > 0) {
          await applyChanges(db, response.changes)
        }

        cursor = response.cursor
        hasMore = response.has_more

        await putSyncMeta(db, {
          ...meta,
          cursor,
          server_time_offset: clock.offset,
          last_sync_at: Date.now(),
        })
      }

      broadcastChange()
      emitSyncState({ syncing: false, error: null })
      return { ok: true }
    } finally {
      syncing = false
      emitSyncState({ syncing: false })
    }
  }

  if (navigator.locks) {
    try {
      return await navigator.locks.request(SYNC_LOCK_NAME, run)
    } catch {
      return run()
    }
  }
  return run()
}

type ScheduleSyncOptions = {
  reason?: SyncScheduleReason
}

async function maybeRunSync(userId: string, reason: SyncScheduleReason) {
  const db = await openAccountDb(userId)
  const meta = await getSyncMeta(db)
  const [outbox, assets] = await Promise.all([getPendingOutbox(db), getPendingAssets(db)])
  const now = Date.now()

  if (
    !shouldScheduleSync({
      reason,
      now,
      lastSyncAt: meta?.last_sync_at ?? 0,
      lastAttemptAt: lastSyncAttemptAt,
      hasPendingOutbox: outbox.length > 0,
      hasPendingAssets: assets.length > 0,
    })
  ) {
    return
  }

  await runSync(userId)
}

export function scheduleSync(userId: string, options: ScheduleSyncOptions = {}) {
  const reason = options.reason ?? 'manual'
  if (syncTimer !== null) {
    window.clearTimeout(syncTimer)
  }
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    void maybeRunSync(userId, reason)
  }, SCHEDULE_DEBOUNCE_MS)
}

export function stopSyncLoop() {
  if (syncTimer !== null) {
    window.clearTimeout(syncTimer)
    syncTimer = null
  }
  if (syncInterval !== null) {
    window.clearInterval(syncInterval)
    syncInterval = null
  }
  window.removeEventListener('online', onlineHandler)
  window.removeEventListener('focus', focusHandler)
  document.removeEventListener('visibilitychange', visibilityHandler)
  activeUserId = null
  clock = null
  syncing = false
  lastSyncAttemptAt = 0
}

export function startSyncLoop(userId: string) {
  stopSyncLoop()
  activeUserId = userId
  registerBackgroundSync(userId)
  void runSync(userId)

  window.addEventListener('online', onlineHandler)
  window.addEventListener('focus', focusHandler)
  document.addEventListener('visibilitychange', visibilityHandler)

  syncInterval = window.setInterval(() => {
    if (navigator.onLine && activeUserId) {
      scheduleSync(activeUserId, { reason: 'interval' })
    }
  }, SYNC_INTERVAL_MS)

  return stopSyncLoop
}

export function createOutboxEntry(
  entityType: OutboxEntry['entity_type'],
  entityId: string,
  kind: OutboxEntry['kind'],
  baseRevision: number,
  changes: Record<string, unknown>,
): OutboxEntry {
  const deviceId = getDeviceId()
  if (!clock) {
    clock = new ClientClock(deviceId)
  }
  return {
    mutation_id: crypto.randomUUID(),
    device_id: deviceId,
    entity_type: entityType,
    entity_id: entityId,
    kind,
    base_revision: baseRevision,
    clock: clock.now(),
    changes,
    status: 'pending',
    created_at: Date.now(),
  }
}

export function getClientClock(): ClientClock {
  if (!clock) {
    clock = new ClientClock(getDeviceId())
  }
  return clock
}

export async function hasPendingSync(userId: string): Promise<boolean> {
  const db = await openAccountDb(userId)
  const outbox = await getPendingOutbox(db)
  return outbox.length > 0
}
