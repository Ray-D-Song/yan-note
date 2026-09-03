<script setup lang="ts">
import { getMarkdown, replaceAll } from '@milkdown/kit/utils'
import { Milkdown, useEditor } from '@milkdown/vue'
import type { NodeViewFactory } from '@prosemirror-adapter/vue'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { createCrepeEditor } from '@/components/editor/createCrepeEditor'
import { slashMenuContext } from '@/components/editor/plugins/slash-menu'
import { uploadImageFile } from '@/lib/upload'
import { useThemeStore } from '@/stores/theme'

const props = defineProps<{
  initialContent: string
  noteId?: string | null
  nodeViewFactory?: NodeViewFactory
}>()

const emit = defineEmits<{
  dirty: []
  blur: []
  snapshot: [content: string]
}>()

const themeStore = useThemeStore()
const isComposing = ref(false)
const isApplyingInitialContent = ref(false)
const hasAppliedInitialContent = ref(false)

const { get, loading } = useEditor((root) => {
  slashMenuContext.noteId = props.noteId ?? null

  root.addEventListener('compositionstart', () => {
    isComposing.value = true
  })
  root.addEventListener('compositionend', () => {
    isComposing.value = false
    emit('dirty')
  })
  root.addEventListener('blur', () => {
    emit('blur')
  })

  root.classList.add('milkdown')

  const crepe = createCrepeEditor(root, {
    defaultValue: props.initialContent,
    colorScheme: themeStore.colorScheme,
    nodeViewFactory: props.nodeViewFactory,
    onUpload: uploadImageFile,
  })

  crepe.on((listener) => {
    listener.markdownUpdated(() => {
      if (isApplyingInitialContent.value || isComposing.value) {
        return
      }
      emit('dirty')
    })
  })

  return crepe
})

async function applyInitialContent(
  force = false,
  expected?: { noteId: string | null | undefined; content: string },
) {
  const editor = get()
  if (!editor || loading.value) {
    return false
  }

  if (hasAppliedInitialContent.value && !force) {
    return true
  }

  if (
    expected &&
    (props.noteId !== expected.noteId || props.initialContent !== expected.content)
  ) {
    return false
  }

  isApplyingInitialContent.value = true
  try {
    editor.action(replaceAll(props.initialContent, true))
    hasAppliedInitialContent.value = true
    return true
  } finally {
    isApplyingInitialContent.value = false
  }
}

watch(
  () => [loading.value, props.noteId, props.initialContent] as const,
  async (current, previous) => {
    const [isLoading, noteId, content] = current
    const [wasLoading, prevNoteId, prevContent] = previous ?? [true, undefined, undefined]

    slashMenuContext.noteId = noteId ?? null
    if (isLoading || !noteId) {
      return
    }

    const noteChanged = prevNoteId !== undefined && noteId !== prevNoteId
    const contentChanged = content !== prevContent
    const editorJustReady = wasLoading && !isLoading

    if (!noteChanged && !contentChanged && !editorJustReady && hasAppliedInitialContent.value) {
      return
    }

    if (noteChanged) {
      hasAppliedInitialContent.value = false
    }

    const expected = { noteId, content }
    await nextTick()
    await applyInitialContent(noteChanged || contentChanged || editorJustReady, expected)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  const editor = get()
  if (!editor || loading.value) {
    return
  }
  emit('snapshot', editor.action(getMarkdown()))
})

function isReady(): boolean {
  const editor = get()
  return !loading.value && Boolean(editor) && hasAppliedInitialContent.value
}

function readMarkdown(): string {
  const editor = get()
  if (!editor || loading.value) {
    return ''
  }
  return editor.action(getMarkdown())
}

defineExpose({
  getMarkdown: readMarkdown,
  isReady,
})
</script>

<template>
  <Milkdown class="milkdown milkdown-root" />
</template>

<style scoped>
@import '@/components/editor/crepe-theme.css';

.milkdown-root {
  min-height: 320px;
}
</style>
