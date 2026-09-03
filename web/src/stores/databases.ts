import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  createDatabaseLocal,
  createRowLocal,
  loadAllDatabasesFromLocal,
  loadDatabaseFromLocal,
  updateCellLocal,
} from '@/lib/local-databases'
import { onSyncDataChanged, scheduleSync } from '@/lib/sync/engine'
import { getLastUserId } from '@/lib/sync/device-id'
import type { Database, DatabaseListItem, DatabaseRow } from '@/types/database'

export const useDatabasesStore = defineStore('databases', () => {
  const cache = ref<Map<string, Database>>(new Map())
  const loadingIds = ref<Set<string>>(new Set())

  function getUserId(): string {
    const id = getLastUserId()
    if (!id) throw new Error('Not initialized')
    return id
  }

  function getCached(id: string): Database | null {
    return cache.value.get(id) ?? null
  }

  async function fetchDatabase(id: string) {
    loadingIds.value.add(id)
    try {
      const database = await loadDatabaseFromLocal(getUserId(), id)
      if (database) {
        cache.value.set(id, database)
      }
      return database
    } finally {
      loadingIds.value.delete(id)
    }
  }

  async function refreshAll() {
    const all = await loadAllDatabasesFromLocal(getUserId())
    for (const db of all) {
      cache.value.set(db.id, db)
    }
  }

  async function init() {
    await refreshAll()
    onSyncDataChanged(() => {
      void refreshAll()
    })
  }

  async function createDatabase(payload: { title?: string; note_id?: string | null }) {
    const database = await createDatabaseLocal(getUserId(), payload)
    cache.value.set(database.id, database)
    return database
  }

  async function createRow(databaseId: string) {
    const row = await createRowLocal(getUserId(), databaseId)
    await fetchDatabase(databaseId)
    return row
  }

  async function updateCell(
    databaseId: string,
    rowId: string,
    propertyId: string,
    value: string,
  ) {
    await updateCellLocal(getUserId(), databaseId, rowId, propertyId, value)
    const cached = cache.value.get(databaseId)
    if (cached) {
      const row = cached.rows.find((item) => item.id === rowId)
      if (row) {
        row.cells[propertyId] = value
      }
    }
    scheduleSync(getUserId(), { reason: 'local_edit' })
  }

  function reset() {
    cache.value = new Map()
    loadingIds.value = new Set()
  }

  return {
    cache,
    loadingIds,
    getCached,
    fetchDatabase,
    createDatabase,
    createRow,
    updateCell,
    init,
    reset,
  }
})

export type { DatabaseListItem, DatabaseRow }
