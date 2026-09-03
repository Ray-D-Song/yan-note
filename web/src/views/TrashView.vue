<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import NoteIcon from '@/components/common/NoteIcon.vue'
import { useNotesStore } from '@/stores/notes'
import { useTrashStore } from '@/stores/trash'

const trashStore = useTrashStore()
const notesStore = useNotesStore()
const selectedIds = ref<Set<string>>(new Set())
const acting = ref(false)

const allSelected = computed(() => {
  return (
    trashStore.items.length > 0 &&
    trashStore.items.every((item) => selectedIds.value.has(item.id))
  )
})

const selectedCount = computed(() => selectedIds.value.size)

function formatDeletedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toggleSelectAll(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    selectedIds.value = new Set(trashStore.items.map((item) => item.id))
  } else {
    selectedIds.value = new Set()
  }
}

function toggleSelect(id: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  const next = new Set(selectedIds.value)
  if (checked) {
    next.add(id)
  } else {
    next.delete(id)
  }
  selectedIds.value = next
}

function clearSelection() {
  selectedIds.value = new Set()
}

async function handleRestoreSelected() {
  if (selectedCount.value === 0 || acting.value) {
    return
  }
  acting.value = true
  try {
    const ids = [...selectedIds.value]
    await trashStore.restoreSelected(ids)
    await notesStore.fetchNotes()
    clearSelection()
  } finally {
    acting.value = false
  }
}

async function handleHardDeleteSelected() {
  if (selectedCount.value === 0 || acting.value) {
    return
  }
  if (
    !confirm(
      `确定永久删除所选的 ${selectedCount.value} 条笔记吗？此操作不可恢复。`,
    )
  ) {
    return
  }
  acting.value = true
  try {
    const ids = [...selectedIds.value]
    await trashStore.hardDeleteSelected(ids)
    clearSelection()
  } finally {
    acting.value = false
  }
}

async function handleEmptyTrash() {
  if (trashStore.items.length === 0 || acting.value) {
    return
  }
  if (
    !confirm(
      `确定永久删除回收站中的全部 ${trashStore.items.length} 条笔记吗？此操作不可恢复。`,
    )
  ) {
    return
  }
  acting.value = true
  try {
    await trashStore.emptyTrash()
    clearSelection()
  } finally {
    acting.value = false
  }
}

onMounted(async () => {
  await trashStore.fetchTrash()
})
</script>

<template>
  <div class="trash-view container py-4">
    <div class="d-flex align-items-center justify-content-between mb-4">
      <h1 class="h4 mb-0">回收站</h1>
      <button
        class="btn btn-sm btn-outline-danger"
        type="button"
        :disabled="trashStore.items.length === 0 || acting"
        @click="handleEmptyTrash"
      >
        清空回收站
      </button>
    </div>

    <div v-if="trashStore.loading" class="text-muted py-5 text-center">加载中…</div>

    <div v-else-if="trashStore.items.length === 0" class="text-muted py-5 text-center">
      回收站为空
    </div>

    <div v-else class="trash-list">
      <div class="trash-list-header d-flex align-items-center gap-3 px-3 py-2 border-bottom">
        <input
          class="form-check-input mt-0"
          type="checkbox"
          :checked="allSelected"
          aria-label="全选"
          @change="toggleSelectAll"
        />
        <span class="text-muted small">全选</span>
      </div>

      <ul class="list-unstyled mb-0">
        <li
          v-for="item in trashStore.items"
          :key="item.id"
          class="trash-list-item d-flex align-items-center gap-3 px-3 py-2 border-bottom"
        >
          <input
            class="form-check-input mt-0 flex-shrink-0"
            type="checkbox"
            :checked="selectedIds.has(item.id)"
            :aria-label="`选择 ${item.title}`"
            @change="toggleSelect(item.id, $event)"
          />
          <NoteIcon size="16px" />
          <span class="flex-grow-1 text-truncate">{{ item.title }}</span>
          <span class="text-muted small flex-shrink-0">
            删除于 {{ formatDeletedAt(item.deleted_at) }}
          </span>
        </li>
      </ul>
    </div>

    <div
      v-if="selectedCount > 0"
      class="trash-action-bar d-flex align-items-center justify-content-between gap-3 mt-3 p-3 border rounded"
    >
      <span class="small">已选 {{ selectedCount }} 项</span>
      <div class="d-flex gap-2">
        <button
          class="btn btn-sm btn-primary"
          type="button"
          :disabled="acting"
          @click="handleRestoreSelected"
        >
          恢复所选
        </button>
        <button
          class="btn btn-sm btn-outline-danger"
          type="button"
          :disabled="acting"
          @click="handleHardDeleteSelected"
        >
          永久删除所选
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trash-view {
  max-width: 960px;
}

.trash-list {
  border: 1px solid rgba(55, 53, 47, 0.09);
  border-radius: 8px;
  overflow: hidden;
}

:root[data-theme='dark'] .trash-list {
  border-color: rgba(255, 255, 255, 0.1);
}

.trash-list-header,
.trash-list-item {
  border-color: rgba(55, 53, 47, 0.09) !important;
}

:root[data-theme='dark'] .trash-list-header,
:root[data-theme='dark'] .trash-list-item {
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.trash-list-item:hover {
  background: rgba(55, 53, 47, 0.04);
}

:root[data-theme='dark'] .trash-list-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.trash-action-bar {
  background: rgba(55, 53, 47, 0.03);
  border-color: rgba(55, 53, 47, 0.09) !important;
}

:root[data-theme='dark'] .trash-action-bar {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1) !important;
}
</style>
