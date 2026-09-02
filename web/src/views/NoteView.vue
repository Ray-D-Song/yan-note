<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import MilkdownEditorWrapper from '@/components/editor/MilkdownEditorWrapper.vue'
import NoteIcon from '@/components/common/NoteIcon.vue'
import { syncStatusLabel, useNoteSync } from '@/composables/useNoteSync'
import { useNotesStore } from '@/stores/notes'
import { getNoteBreadcrumbs } from '@/types/note'

const route = useRoute()
const notesStore = useNotesStore()

const title = ref('')
const initialContent = ref('')
const noteLoaded = ref(false)
const editorKey = ref(0)
const editorRef = ref<InstanceType<typeof MilkdownEditorWrapper> | null>(null)

const noteId = computed(() =>
  typeof route.params.id === 'string' ? route.params.id : null,
)

const breadcrumbs = computed(() => {
  if (!noteId.value) {
    return []
  }
  return getNoteBreadcrumbs(notesStore.notes, noteId.value)
})

const sync = useNoteSync({
  noteId,
  getSnapshot: () => ({
    title: title.value,
    content: editorRef.value?.getMarkdown() ?? '',
  }),
  isReady: () => editorRef.value?.isReady() ?? false,
  save: async (id, snapshot) => {
    await notesStore.updateNote(id, {
      title: snapshot.title,
      content: snapshot.content,
    })
  },
})

const statusLabel = computed(() => syncStatusLabel(sync.status.value))

async function loadNote(id: string) {
  noteLoaded.value = false
  await notesStore.fetchNote(id)
  title.value = notesStore.currentNote?.title ?? ''
  initialContent.value = notesStore.currentNote?.content ?? ''
  sync.setBaseline({
    title: title.value,
    content: initialContent.value,
  })
  editorKey.value += 1
  noteLoaded.value = true
}

watch(
  noteId,
  async (id, previousId) => {
    if (previousId && previousId !== id) {
      await sync.flush()
    }
    if (id) {
      await loadNote(id)
    } else {
      title.value = ''
      initialContent.value = ''
      noteLoaded.value = false
      sync.setBaseline({ title: '', content: '' })
    }
  },
  { immediate: true },
)

function onTitleInput() {
  sync.markDirty()
}

function onEditorDirty() {
  sync.markDirty()
}

function onEditorBlur() {
  void sync.flush()
}
</script>

<template>
  <div v-if="!noteId" class="empty-state d-flex align-items-center justify-content-center h-100">
    <div class="text-center text-muted">
      <h2 class="h4 mb-2">欢迎使用 Yan</h2>
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
            <span class="breadcrumb-icon"><NoteIcon size="14px" /></span>
            {{ crumb.title }}
          </li>
        </ol>
      </nav>
      <span
        class="small"
        :class="sync.status.value === 'error' ? 'text-danger' : 'text-muted'"
      >
        {{ statusLabel }}
      </span>
    </div>

    <input
      v-model="title"
      class="note-title form-control border-0 shadow-none px-0 mb-3"
      placeholder="无标题"
      @input="onTitleInput"
    />

    <MilkdownEditorWrapper
      v-if="noteLoaded"
      :key="`${noteId}-${editorKey}`"
      ref="editorRef"
      :initial-content="initialContent"
      :note-id="noteId"
      @dirty="onEditorDirty"
      @blur="onEditorBlur"
    />
    <div v-else class="text-muted small py-3">加载中...</div>
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
  color: inherit;
}

.note-title:focus {
  box-shadow: none;
}

.empty-state {
  min-height: 100%;
}

.breadcrumb-icon {
  display: inline-flex;
  align-items: center;
  margin-right: 0.25rem;
  vertical-align: middle;
}
</style>
