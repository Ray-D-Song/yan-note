import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createNoteLocal,
  deleteNoteLocal,
  loadNoteFromLocal,
  loadNotesFromLocal,
  moveNoteLocal,
  updateNoteLocal,
} from '@/lib/local-notes'
import { onSyncDataChanged, scheduleSync } from '@/lib/sync/engine'
import {
  buildNoteTree,
  collectDescendantIds,
  type Note,
  type NoteListItem,
  type NoteReorderUpdate,
  type NoteTreeNode,
} from '@/types/note'

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<NoteListItem[]>([])
  const currentNote = ref<Note | null>(null)
  const loading = ref(false)
  const localReady = ref(false)
  let userId: string | null = null
  let unsubscribe: (() => void) | null = null

  const notesTree = computed<NoteTreeNode[]>(() => buildNoteTree(notes.value))

  async function initForUser(uid: string) {
    userId = uid
    await refreshFromLocal()
    localReady.value = true
    unsubscribe?.()
    unsubscribe = onSyncDataChanged(() => {
      void refreshFromLocal()
    })
  }

  async function refreshFromLocal() {
    if (!userId) return
    notes.value = await loadNotesFromLocal(userId)
    if (currentNote.value) {
      const updated = await loadNoteFromLocal(userId, currentNote.value.id)
      if (updated) {
        currentNote.value = updated
      }
    }
  }

  async function fetchNotes() {
    await refreshFromLocal()
  }

  async function fetchNote(id: string) {
    if (!userId) return
    loading.value = true
    try {
      const note = await loadNoteFromLocal(userId, id)
      if (note) {
        currentNote.value = note
        const index = notes.value.findIndex((n) => n.id === id)
        const listItem: NoteListItem = {
          id: note.id,
          parent_id: note.parent_id,
          title: note.title,
          icon: note.icon,
          position_key: note.position_key,
          sort_order: 0,
          revision: note.revision,
          created_at: note.created_at,
          updated_at: note.updated_at,
        }
        if (index >= 0) {
          notes.value[index] = listItem
        } else {
          notes.value.push(listItem)
        }
      }
    } finally {
      loading.value = false
    }
  }

  async function createNote(payload: {
    title?: string
    parent_id?: string | null
    content?: string
  } = {}) {
    if (!userId) throw new Error('Not initialized')
    const note = await createNoteLocal(userId, payload)
    notes.value.push({
      id: note.id,
      parent_id: note.parent_id,
      title: note.title,
      icon: note.icon,
      position_key: note.position_key,
      sort_order: 0,
      revision: note.revision,
      created_at: note.created_at,
      updated_at: note.updated_at,
    })
    return note
  }

  async function updateNote(
    id: string,
    payload: Partial<Pick<Note, 'title' | 'content' | 'parent_id' | 'icon'>>,
  ) {
    if (!userId) throw new Error('Not initialized')
    const note = await updateNoteLocal(userId, id, payload)
    const index = notes.value.findIndex((item) => item.id === id)
    if (index >= 0) {
      notes.value[index] = {
        id: note.id,
        parent_id: note.parent_id,
        title: note.title,
        icon: note.icon,
        position_key: note.position_key,
        sort_order: 0,
        revision: note.revision,
        created_at: note.created_at,
        updated_at: note.updated_at,
      }
    }
    if (currentNote.value?.id === id) {
      currentNote.value = note
    }
    return note
  }

  async function deleteNote(id: string) {
    if (!userId) throw new Error('Not initialized')
    await deleteNoteLocal(userId, id)
    const idsToRemove = collectDescendantIds(notes.value, id)
    notes.value = notes.value.filter((note) => !idsToRemove.has(note.id))
    if (currentNote.value && idsToRemove.has(currentNote.value.id)) {
      currentNote.value = null
    }
  }

  function applyReorderUpdates(updates: NoteReorderUpdate[]) {
    for (const update of updates) {
      update.ordered_ids.forEach((id, index) => {
        const note = notes.value.find((item) => item.id === id)
        if (!note) return
        note.parent_id = update.parent_id
        note.sort_order = index
      })
    }
  }

  async function reorderNotes(updates: NoteReorderUpdate[]) {
    if (!userId || updates.length === 0) return

    const snapshot = notes.value.map((note) => ({ ...note }))
    applyReorderUpdates(updates)

    try {
      for (const update of updates) {
        if (update.ordered_ids.length === 0 || !update.dragged_id) continue
        await moveNoteLocal(userId, update.dragged_id, update.parent_id, update.ordered_ids)
      }
      scheduleSync(userId)
    } catch {
      notes.value = snapshot
      throw new Error('Failed to reorder notes')
    }
  }

  function reset() {
    unsubscribe?.()
    unsubscribe = null
    userId = null
    notes.value = []
    currentNote.value = null
    localReady.value = false
  }

  return {
    notes,
    currentNote,
    loading,
    localReady,
    notesTree,
    initForUser,
    fetchNotes,
    fetchNote,
    createNote,
    updateNote,
    deleteNote,
    reorderNotes,
    reset,
  }
})
