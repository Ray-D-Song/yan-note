import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  hardDeleteNotesLocal,
  loadTrashFromLocal,
  restoreNotesLocal,
} from '@/lib/local-notes'
import { getLastUserId } from '@/lib/sync/device-id'
import type { TrashNoteItem } from '@/types/note'

export const useTrashStore = defineStore('trash', () => {
  const items = ref<TrashNoteItem[]>([])
  const loading = ref(false)

  function getUserId(): string {
    const id = getLastUserId()
    if (!id) throw new Error('Not initialized')
    return id
  }

  async function fetchTrash() {
    loading.value = true
    try {
      items.value = await loadTrashFromLocal(getUserId())
    } finally {
      loading.value = false
    }
  }

  async function restoreSelected(ids: string[]) {
    await restoreNotesLocal(getUserId(), ids)
    await fetchTrash()
    return ids.length
  }

  async function hardDeleteSelected(ids: string[]) {
    await hardDeleteNotesLocal(getUserId(), ids)
    await fetchTrash()
    return ids.length
  }

  async function emptyTrash() {
    const allIds = items.value.map((item) => item.id)
    await hardDeleteNotesLocal(getUserId(), allIds)
    await fetchTrash()
    return allIds.length
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
