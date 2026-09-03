<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RiCloseLine, RiHistoryLine } from '@remixicon/vue'
import {
  diffLines,
  formatVersionTime,
  useNoteVersions,
} from '@/composables/useNoteVersions'
import { getLastUserId } from '@/lib/sync/device-id'
import { useNotesStore } from '@/stores/notes'

const props = defineProps<{
  noteId: string
  currentTitle: string
  currentContent: string
}>()

const emit = defineEmits<{
  restored: []
  close: []
}>()

const notesStore = useNotesStore()
const open = ref(false)
const previewVersionId = ref<string | null>(null)

const noteIdRef = computed(() => props.noteId)
const { versions, loading, selected, fetchVersions, fetchVersionDetail, restoreVersion } =
  useNoteVersions(noteIdRef)

const diff = computed(() => {
  if (!selected.value) return []
  const snapshot = selected.value.snapshot
  if (selected.value.field_name === 'content') {
    return diffLines(props.currentContent, snapshot.content ?? '')
  }
  if (selected.value.field_name === 'title') {
    return diffLines(props.currentTitle, snapshot.title ?? '')
  }
  return []
})

async function show() {
  open.value = true
  await fetchVersions()
}

async function onSelectVersion(versionId: string) {
  previewVersionId.value = versionId
  await fetchVersionDetail(versionId)
}

async function onRestore() {
  if (!selected.value) return
  const userId = getLastUserId()
  if (!userId) return
  await restoreVersion(userId, selected.value)
  await notesStore.fetchNote(props.noteId)
  emit('restored')
  open.value = false
}

watch(
  () => props.noteId,
  () => {
    previewVersionId.value = null
  },
)

defineExpose({ show })
</script>

<template>
  <div>
    <button
      class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
      type="button"
      title="版本历史"
      @click="show"
    >
      <RiHistoryLine size="16px" aria-hidden="true" />
      <span class="d-none d-md-inline">历史</span>
    </button>

    <Teleport to="body">
      <div v-if="open" class="version-panel-backdrop" @click.self="open = false; emit('close')">
        <div class="version-panel">
          <div class="version-panel-header d-flex align-items-center justify-content-between px-3 py-2 border-bottom">
            <strong class="small mb-0">版本历史</strong>
            <button class="btn btn-sm btn-link text-muted" type="button" @click="open = false; emit('close')">
              <RiCloseLine size="18px" />
            </button>
          </div>

          <div v-if="loading" class="p-3 text-muted small">加载中...</div>
          <div v-else class="version-panel-body d-flex">
            <ul class="version-list list-unstyled mb-0 border-end">
              <li
                v-for="version in versions"
                :key="version.id"
                class="version-list-item px-3 py-2"
                :class="{ active: previewVersionId === version.id }"
                @click="onSelectVersion(version.id)"
              >
                <div class="small fw-medium">{{ version.field_name === 'content' ? '正文' : '标题' }}</div>
                <div class="text-muted" style="font-size: 0.75rem">
                  {{ formatVersionTime(version.created_at) }}
                </div>
                <div class="text-muted" style="font-size: 0.7rem">{{ version.device_id }}</div>
              </li>
              <li v-if="versions.length === 0" class="px-3 py-3 text-muted small">暂无历史版本</li>
            </ul>

            <div class="version-preview flex-grow-1 p-3">
              <template v-if="selected">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="small text-muted">与当前版本对比</span>
                  <button class="btn btn-sm btn-primary" type="button" @click="onRestore">
                    恢复此版本
                  </button>
                </div>
                <pre class="version-diff small mb-0"><code><span
                  v-for="(line, i) in diff"
                  :key="i"
                  :class="{
                    'diff-add': line.type === 'add',
                    'diff-remove': line.type === 'remove',
                  }"
                >{{ line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  ' }}{{ line.line }}
</span></code></pre>
              </template>
              <div v-else class="text-muted small">选择左侧版本查看差异</div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.version-panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1060;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.version-panel {
  width: min(720px, 92vw);
  max-height: 80vh;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

:root[data-theme='dark'] .version-panel {
  background: #252525;
}

.version-panel-body {
  min-height: 280px;
  max-height: calc(80vh - 48px);
  overflow: hidden;
}

.version-list {
  width: 220px;
  overflow-y: auto;
  flex-shrink: 0;
}

.version-list-item {
  cursor: pointer;
  border-bottom: 1px solid rgba(55, 53, 47, 0.06);
}

.version-list-item:hover,
.version-list-item.active {
  background: rgba(55, 53, 47, 0.06);
}

.version-preview {
  overflow: auto;
}

.version-diff {
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(55, 53, 47, 0.04);
  border-radius: 4px;
  padding: 0.75rem;
}

.diff-add {
  background: rgba(46, 170, 96, 0.15);
  display: block;
}

.diff-remove {
  background: rgba(235, 87, 87, 0.12);
  display: block;
}
</style>
