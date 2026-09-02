<script setup lang="ts">
import { provide, ref } from 'vue'
import NoteTreeItem from '@/components/sidebar/NoteTreeItem.vue'
import type { NoteTreeNode } from '@/types/note'

defineProps<{
  nodes: NoteTreeNode[]
}>()

const openMenuId = ref<string | null>(null)

function setOpenMenuId(id: string | null) {
  openMenuId.value = id
}

provide('noteTreeOpenMenuId', openMenuId)
provide('noteTreeSetOpenMenuId', setOpenMenuId)
</script>

<template>
  <ul class="list-unstyled note-tree mb-0">
    <NoteTreeItem v-for="node in nodes" :key="node.id" :node="node" />
  </ul>
</template>
