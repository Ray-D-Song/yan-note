<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import MilkdownEditorWrapper from '@/components/editor/MilkdownEditorWrapper.vue'
import { useNotesStore } from '@/stores/notes'
import { getNoteBreadcrumbs } from '@/types/note'

const route = useRoute()
const notesStore = useNotesStore()

const title = ref('')
const content = ref('')
const saveTimer = ref<number | null>(null)
const saving = ref(false)

const noteId = computed(() =>
  typeof route.params.id === 'string' ? route.params.id : null,
)

const breadcrumbs = computed(() => {
  if (!noteId.value) {
    return []
  }
  return getNoteBreadcrumbs(notesStore.notes, noteId.value)
})

async function loadNote(id: string) {
  await notesStore.fetchNote(id)
  title.value = notesStore.currentNote?.title ?? ''
  content.value = notesStore.currentNote?.content ?? ''
}

watch(
  noteId,
  async (id) => {
    if (id) {
      await loadNote(id)
    } else {
      title.value = ''
      content.value = ''
    }
  },
  { immediate: true },
)

function scheduleSave(payload: { title?: string; content?: string }) {
  if (!noteId.value) {
    return
  }
  if (saveTimer.value) {
    window.clearTimeout(saveTimer.value)
  }
  saveTimer.value = window.setTimeout(async () => {
    saving.value = true
    try {
      await notesStore.updateNote(noteId.value!, payload)
    } finally {
      saving.value = false
    }
  }, 800)
}

function onTitleBlur() {
  if (!noteId.value || title.value === notesStore.currentNote?.title) {
    return
  }
  scheduleSave({ title: title.value })
}

function onContentChange(value: string) {
  content.value = value
  if (!noteId.value || value === notesStore.currentNote?.content) {
    return
  }
  scheduleSave({ content: value })
}
</script>

<template>
  <div v-if="!noteId" class="empty-state d-flex align-items-center justify-content-center h-100">
    <div class="text-center text-muted">
      <h2 class="h4 mb-2">欢迎使用 Yan-Note</h2>
      <p class="mb-0">从左侧选择笔记，或新建一条开始写作</p>
    </div>
  </div>

  <div v-else class="note-view px-4 py-3">
    <div class="d-flex align-items-center justify-content-between mb-3">
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0 small">
          <li
            v-for="(crumb, index) in breadcrumbs"
            :key="crumb.id"
            class="breadcrumb-item"
            :class="{ active: index === breadcrumbs.length - 1 }"
          >
            {{ crumb.icon ?? '📄' }} {{ crumb.title }}
          </li>
        </ol>
      </nav>
      <span v-if="saving" class="text-muted small">保存中...</span>
    </div>

    <input
      v-model="title"
      class="note-title form-control border-0 shadow-none px-0 mb-3"
      placeholder="无标题"
      @blur="onTitleBlur"
    />

    <MilkdownEditorWrapper
      :key="noteId"
      :model-value="content"
      @update:model-value="onContentChange"
    />
  </div>
</template>

<style scoped>
.note-view {
  max-width: 900px;
  margin: 0 auto;
}

.note-title {
  font-size: 2.5rem;
  font-weight: 700;
  background: transparent;
}

.note-title:focus {
  box-shadow: none;
}

.empty-state {
  min-height: 100%;
}
</style>
