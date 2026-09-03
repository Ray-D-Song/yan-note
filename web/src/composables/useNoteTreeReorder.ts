import { inject, provide, type InjectionKey, type Ref } from 'vue'

import type { NoteListItem, NoteReorderUpdate } from '@/types/note'

type ReorderQueueContext = {
  queueReorder: (parentId: string | null, orderedIds: string[]) => void
}

const reorderQueueKey: InjectionKey<ReorderQueueContext> = Symbol('noteTreeReorderQueue')

export function provideNoteTreeReorderQueue(
  flush: (updates: NoteReorderUpdate[]) => Promise<void>,
) {
  const pending = new Map<string, NoteReorderUpdate>()
  let timer: number | null = null

  function queueReorder(parentId: string | null, orderedIds: string[]) {
    pending.set(parentId ?? '__root__', {
      parent_id: parentId,
      ordered_ids: orderedIds,
    })

    if (timer !== null) {
      window.clearTimeout(timer)
    }

    timer = window.setTimeout(() => {
      timer = null
      const updates = [...pending.values()]
      pending.clear()
      void flush(updates)
    }, 0)
  }

  provide(reorderQueueKey, { queueReorder })
}

export function useNoteTreeReorderQueue() {
  const context = inject(reorderQueueKey)
  if (!context) {
    throw new Error('Note tree reorder queue is not provided')
  }
  return context
}

export function useNoteTreeReorderQueueOptional() {
  return inject(reorderQueueKey, null)
}

export type NoteTreeNotesRef = Ref<NoteListItem[]>

export const noteTreeNotesKey: InjectionKey<NoteTreeNotesRef> = Symbol('noteTreeNotes')

export function provideNoteTreeNotes(notes: NoteTreeNotesRef) {
  provide(noteTreeNotesKey, notes)
}

export function useNoteTreeNotes() {
  const notes = inject(noteTreeNotesKey)
  if (!notes) {
    throw new Error('Note tree notes are not provided')
  }
  return notes
}
