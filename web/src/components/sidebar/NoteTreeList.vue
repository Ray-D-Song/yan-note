<script setup lang="ts">
import { inject, ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import NoteTreeItem from '@/components/sidebar/NoteTreeItem.vue'
import { useNoteTreeNotes, useNoteTreeReorderQueue } from '@/composables/useNoteTreeReorder'
import { isDescendantOfNote, type NoteTreeNode } from '@/types/note'

const props = defineProps<{
  parentId: string | null
  nodes: NoteTreeNode[]
  nested?: boolean
}>()

const { queueReorder } = useNoteTreeReorderQueue()
const notes = useNoteTreeNotes()
const expandNode = inject<(id: string) => void>('noteTreeExpandNode')!

const list = ref<NoteTreeNode[]>([])
const pendingDragId = ref<string | null>(null)

watch(
  () => props.nodes,
  (nodes) => {
    list.value = nodes
  },
  { immediate: true },
)

function onListChange(draggedId: string) {
  queueReorder(
    props.parentId,
    list.value.map((node) => node.id),
    draggedId,
  )
}

function onAdd() {
  if (props.parentId) {
    expandNode(props.parentId)
  }
  const draggedId = pendingDragId.value
  pendingDragId.value = null
  if (draggedId) onListChange(draggedId)
}

function onUpdate() {
  const draggedId = pendingDragId.value
  pendingDragId.value = null
  if (draggedId) onListChange(draggedId)
}

function onMove(event: { draggedContext?: { element?: NoteTreeNode } }): boolean {
  const dragged = event.draggedContext?.element
  if (!dragged?.id) {
    return true
  }

  pendingDragId.value = dragged.id

  const targetParentId = props.parentId
  if (targetParentId === dragged.id) {
    return false
  }

  if (targetParentId && isDescendantOfNote(notes.value, dragged.id, targetParentId)) {
    return false
  }

  return true
}

function onDragEnd() {
  pendingDragId.value = null
}
</script>

<template>
  <VueDraggable
    v-model="list"
    tag="ul"
    class="list-unstyled note-tree mb-0"
    :class="{ 'note-tree-nested ms-3': nested }"
    item-key="id"
    handle=".note-tree-drag-handle"
    :group="{ name: 'notes', pull: true, put: true }"
    :animation="150"
    ghost-class="note-tree-ghost"
    chosen-class="note-tree-chosen"
    drag-class="note-tree-drag"
    :move="onMove"
    @add="onAdd"
    @update="onUpdate"
    @end="onDragEnd"
  >
    <NoteTreeItem v-for="element in list" :key="element.id" :node="element" />
  </VueDraggable>
</template>

<style scoped>
:deep(.note-tree-ghost) {
  opacity: 0.5;
  background: rgba(55, 53, 47, 0.06);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

:deep(.note-tree-chosen) {
  background: rgba(55, 53, 47, 0.04);
}

:deep(.note-tree-drag) {
  opacity: 0.9;
}

:root[data-theme='dark'] :deep(.note-tree-ghost) {
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}

:root[data-theme='dark'] :deep(.note-tree-chosen) {
  background: rgba(255, 255, 255, 0.06);
}
</style>
