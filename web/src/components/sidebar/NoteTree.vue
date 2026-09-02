<script setup lang="ts">
import { RiCloseLine } from '@remixicon/vue'
import { useRoute, useRouter } from 'vue-router'
import NoteIcon from '@/components/common/NoteIcon.vue'
import type { NoteTreeNode } from '@/types/note'
import { useNotesStore } from '@/stores/notes'

defineProps<{
  nodes: NoteTreeNode[]
}>()

const route = useRoute()
const router = useRouter()
const notesStore = useNotesStore()

function isActive(id: string) {
  return route.params.id === id
}

async function openNote(id: string) {
  await router.push({ name: 'note', params: { id } })
}

async function deleteNote(id: string, event: Event) {
  event.stopPropagation()
  if (!confirm('确定删除这条笔记及其子笔记吗？')) {
    return
  }
  await notesStore.deleteNote(id)
  if (route.params.id === id) {
    const next = notesStore.notes[0]
    if (next) {
      await router.push({ name: 'note', params: { id: next.id } })
    } else {
      await router.push({ name: 'home' })
    }
  }
}
</script>

<template>
  <ul class="list-unstyled note-tree mb-0">
    <li v-for="node in nodes" :key="node.id" class="note-tree-item">
      <div
        class="note-tree-row d-flex align-items-center rounded px-2 py-1"
        :class="{ active: isActive(node.id) }"
        role="button"
        @click="openNote(node.id)"
      >
        <span class="me-2 note-tree-icon">
          <NoteIcon />
        </span>
        <span class="flex-grow-1 text-truncate small">{{ node.title }}</span>
        <button
          class="btn btn-sm btn-link text-danger text-decoration-none delete-btn p-0 ms-1"
          type="button"
          title="删除"
          @click="deleteNote(node.id, $event)"
        >
          <RiCloseLine size="16px" aria-hidden="true" />
        </button>
      </div>
      <NoteTree v-if="node.children.length" :nodes="node.children" class="ms-3" />
    </li>
  </ul>
</template>

<style scoped>
.note-tree-row {
  cursor: pointer;
  color: #37352f;
}

.note-tree-row:hover {
  background: rgba(0, 0, 0, 0.04);
}

.note-tree-row.active {
  background: rgba(0, 0, 0, 0.08);
}

.delete-btn {
  opacity: 0;
  line-height: 1;
  display: inline-flex;
  align-items: center;
}

.note-tree-icon {
  display: inline-flex;
  align-items: center;
  color: inherit;
}

.note-tree-row:hover .delete-btn {
  opacity: 1;
}

:root[data-theme='dark'] .note-tree-row {
  color: #e6e6e6;
}

:root[data-theme='dark'] .note-tree-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

:root[data-theme='dark'] .note-tree-row.active {
  background: rgba(255, 255, 255, 0.1);
}
</style>
