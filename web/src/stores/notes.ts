import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiRequest } from '@/api/client'
import {
  buildNoteTree,
  type Note,
  type NoteListItem,
  type NoteReorderUpdate,
  type NoteTreeNode,
} from '@/types/note'

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<NoteListItem[]>([])
  const currentNote = ref<Note | null>(null)
  const loading = ref(false)

  const notesTree = computed<NoteTreeNode[]>(() => buildNoteTree(notes.value))

  async function fetchNotes() {
    notes.value = await apiRequest<NoteListItem[]>('/notes')
  }

  async function fetchNote(id: string) {
    loading.value = true
    try {
      currentNote.value = await apiRequest<Note>(`/notes/${id}`)
      const index = notes.value.findIndex((note) => note.id === id)
      if (index >= 0) {
        notes.value[index] = {
          id: currentNote.value.id,
          parent_id: currentNote.value.parent_id,
          title: currentNote.value.title,
          icon: currentNote.value.icon,
          sort_order: currentNote.value.sort_order,
          created_at: currentNote.value.created_at,
          updated_at: currentNote.value.updated_at,
        }
      } else {
        notes.value.push({
          id: currentNote.value.id,
          parent_id: currentNote.value.parent_id,
          title: currentNote.value.title,
          icon: currentNote.value.icon,
          sort_order: currentNote.value.sort_order,
          created_at: currentNote.value.created_at,
          updated_at: currentNote.value.updated_at,
        })
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
    const note = await apiRequest<Note>('/notes', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    notes.value.push({
      id: note.id,
      parent_id: note.parent_id,
      title: note.title,
      icon: note.icon,
      sort_order: note.sort_order,
      created_at: note.created_at,
      updated_at: note.updated_at,
    })
    return note
  }

  async function updateNote(
    id: string,
    payload: Partial<Pick<Note, 'title' | 'content' | 'parent_id' | 'icon'>>,
  ) {
    const note = await apiRequest<Note>(`/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
    const index = notes.value.findIndex((item) => item.id === id)
    if (index >= 0) {
      notes.value[index] = {
        id: note.id,
        parent_id: note.parent_id,
        title: note.title,
        icon: note.icon,
        sort_order: note.sort_order,
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
    await apiRequest<{ ok: boolean }>(`/notes/${id}`, { method: 'DELETE' })
    notes.value = notes.value.filter((note) => note.id !== id)
    if (currentNote.value?.id === id) {
      currentNote.value = null
    }
  }

  function applyReorderUpdates(updates: NoteReorderUpdate[]) {
    for (const update of updates) {
      update.ordered_ids.forEach((id, index) => {
        const note = notes.value.find((item) => item.id === id)
        if (!note) {
          return
        }
        note.parent_id = update.parent_id
        note.sort_order = index
      })
    }
  }

  async function reorderNotes(updates: NoteReorderUpdate[]) {
    if (updates.length === 0) {
      return
    }

    const snapshot = notes.value.map((note) => ({ ...note }))
    applyReorderUpdates(updates)

    try {
      await apiRequest<{ ok: boolean }>('/notes/reorder', {
        method: 'PUT',
        body: JSON.stringify({ updates }),
      })
    } catch {
      notes.value = snapshot
      throw new Error('Failed to reorder notes')
    }
  }

  return {
    notes,
    currentNote,
    loading,
    notesTree,
    fetchNotes,
    fetchNote,
    createNote,
    updateNote,
    deleteNote,
    reorderNotes,
  }
})
