import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiRequest } from '@/api/client'
import type { Database, DatabaseListItem, DatabaseRow } from '@/types/database'

export const useDatabasesStore = defineStore('databases', () => {
  const databases = ref<DatabaseListItem[]>([])
  const currentDatabase = ref<Database | null>(null)
  const currentProperties = ref<Database['properties']>([])
  const currentRows = ref<DatabaseRow[]>([])

  async function fetchDatabase(id: string) {
    const database = await apiRequest<Database>(`/databases/${id}`)
    currentDatabase.value = database
    currentProperties.value = database.properties
    currentRows.value = database.rows
    return database
  }

  async function createDatabase(payload: {
    title?: string
    note_id?: string | null
  }) {
    const database = await apiRequest<Database>('/databases', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    databases.value.unshift({
      id: database.id,
      note_id: database.note_id,
      title: database.title,
      updated_at: database.updated_at,
    })
    currentDatabase.value = database
    currentProperties.value = database.properties
    currentRows.value = database.rows
    return database
  }

  async function createRow(databaseId: string) {
    const response = await apiRequest<{ row: DatabaseRow; database: Database }>(
      `/databases/${databaseId}/rows`,
      { method: 'POST' },
    )
    if (currentDatabase.value?.id === databaseId) {
      currentDatabase.value = response.database
      currentRows.value = response.database.rows
      currentProperties.value = response.database.properties
    }
    return response.row
  }

  async function updateCell(
    databaseId: string,
    rowId: string,
    propertyId: string,
    value: string,
  ) {
    await apiRequest<{ ok: boolean }>(
      `/databases/${databaseId}/rows/${rowId}/cells/${propertyId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ value }),
      },
    )

    if (currentDatabase.value?.id !== databaseId) {
      return
    }

    const row = currentRows.value.find((item) => item.id === rowId)
    if (row) {
      row.cells[propertyId] = value
    }
  }

  return {
    databases,
    currentDatabase,
    currentProperties,
    currentRows,
    fetchDatabase,
    createDatabase,
    createRow,
    updateCell,
  }
})
