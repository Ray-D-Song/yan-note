<script setup lang="ts">
import { provide, ref } from 'vue'
import NoteTreeItem from '@/components/sidebar/NoteTreeItem.vue'
import type { NoteTreeNode } from '@/types/note'

defineProps<{
  nodes: NoteTreeNode[]
}>()

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
  <ul class="list-unstyled note-tree mb-0">
    <NoteTreeItem v-for="node in nodes" :key="node.id" :node="node" />
  </ul>
</template>
