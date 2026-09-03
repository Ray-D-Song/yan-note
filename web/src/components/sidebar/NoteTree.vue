<script setup lang="ts">
import { provide, ref, toRef } from 'vue'
import NoteTreeList from '@/components/sidebar/NoteTreeList.vue'
import {
  provideNoteTreeNotes,
  provideNoteTreeReorderQueue,
} from '@/composables/useNoteTreeReorder'
import { useNotesStore } from '@/stores/notes'
import type { NoteTreeNode } from '@/types/note'

defineProps<{
  nodes: NoteTreeNode[]
}>()

const notesStore = useNotesStore()
provideNoteTreeReorderQueue(notesStore.reorderNotes)
provideNoteTreeNotes(toRef(notesStore, 'notes'))

const COLLAPSED_STORAGE_KEY = 'yan-note:collapsed-note-ids'

const openMenuId = ref<string | null>(null)
const collapsedIds = ref<Set<string>>(loadCollapsedIds())

function loadCollapsedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY)
    if (!raw) {
      return new Set()
    }
    const parsed = JSON.parse(raw) as string[]
    return new Set(parsed)
  } catch {
    return new Set()
  }
}

function persistCollapsedIds() {
  localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsedIds.value]))
}

function setOpenMenuId(id: string | null) {
  openMenuId.value = id
}

function toggleCollapsed(id: string) {
  const next = new Set(collapsedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  collapsedIds.value = next
  persistCollapsedIds()
}

function expandNode(id: string) {
  if (!collapsedIds.value.has(id)) {
    return
  }
  const next = new Set(collapsedIds.value)
  next.delete(id)
  collapsedIds.value = next
  persistCollapsedIds()
}

provide('noteTreeOpenMenuId', openMenuId)
provide('noteTreeSetOpenMenuId', setOpenMenuId)
provide('noteTreeCollapsedIds', collapsedIds)
provide('noteTreeToggleCollapsed', toggleCollapsed)
provide('noteTreeExpandNode', expandNode)
</script>

<template>
  <NoteTreeList :parent-id="null" :nodes="nodes" />
</template>
