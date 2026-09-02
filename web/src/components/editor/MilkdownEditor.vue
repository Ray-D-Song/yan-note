<script setup lang="ts">
import { getMarkdown, replaceAll } from '@milkdown/kit/utils'
import { Milkdown, useEditor } from '@milkdown/vue'
import { ProsemirrorAdapterProvider, useNodeViewFactory } from '@prosemirror-adapter/vue'
import { nextTick, ref, watch } from 'vue'

import { createCrepeEditor } from '@/components/editor/createCrepeEditor'
import { slashMenuContext } from '@/components/editor/plugins/slash-menu'
import { uploadImageFile } from '@/lib/upload'

const props = defineProps<{
  initialContent: string
  noteId?: string | null
}>()

const emit = defineEmits<{
  dirty: []
  blur: []
}>()

const isComposing = ref(false)
const isApplyingInitialContent = ref(false)
const hasAppliedInitialContent = ref(false)
const nodeViewFactory = useNodeViewFactory()

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

  const crepe = createCrepeEditor(root, {
    defaultValue: props.initialContent,
    nodeViewFactory,
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

async function applyInitialContent() {
  const editor = get()
  if (!editor || loading.value) {
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
  () => [loading.value, props.initialContent] as const,
  async ([isLoading]) => {
    if (isLoading || hasAppliedInitialContent.value) {
      return
    }
    await nextTick()
    await applyInitialContent()
  },
  { immediate: true },
)

watch(
  () => props.noteId,
  (noteId) => {
    slashMenuContext.noteId = noteId ?? null
  },
  { immediate: true },
)

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
  <ProsemirrorAdapterProvider>
    <Milkdown class="milkdown-root" />
  </ProsemirrorAdapterProvider>
</template>

<style scoped>
@import '@/components/editor/crepe-theme.css';

.milkdown-root {
  min-height: 320px;
}
</style>
