import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiRequest } from '@/api/client'
import type { TrashNoteItem } from '@/types/note'

export const useTrashStore = defineStore('trash', () => {
  const items = ref<TrashNoteItem[]>([])
  const loading = ref(false)

  async function fetchTrash() {
    loading.value = true
    try {
      items.value = await apiRequest<TrashNoteItem[]>('/notes/trash')
    } finally {
      loading.value = false
    }
  }

  async function restoreSelected(ids: string[]) {
    const result = await apiRequest<{ ok: boolean; restored: number }>('/notes/trash/restore', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
    await fetchTrash()
    return result.restored
  }

  async function hardDeleteSelected(ids: string[]) {
    const result = await apiRequest<{ ok: boolean; deleted: number }>('/notes/trash', {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    })
    await fetchTrash()
    return result.deleted
  }

  async function emptyTrash() {
    const result = await apiRequest<{ ok: boolean; deleted: number }>('/notes/trash/all', {
      method: 'DELETE',
    })
    await fetchTrash()
    return result.deleted
  }

  return {
    items,
    loading,
    fetchTrash,
    restoreSelected,
    hardDeleteSelected,
    emptyTrash,
  }
})
