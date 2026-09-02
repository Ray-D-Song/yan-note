<script setup lang="ts">
import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { getMarkdown, replaceAll } from '@milkdown/kit/utils'
import { nord } from '@milkdown/theme-nord'
import { Milkdown, useEditor } from '@milkdown/vue'
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  initialContent: string
}>()

const emit = defineEmits<{
  dirty: []
  blur: []
}>()

const isComposing = ref(false)
const isApplyingInitialContent = ref(false)
const hasAppliedInitialContent = ref(false)

const { get, loading } = useEditor((root) => {
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

  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, props.initialContent)
      ctx.inject(listenerCtx)
      ctx.get(listenerCtx).markdownUpdated(() => {
        if (isApplyingInitialContent.value || isComposing.value) {
          return
        }
        emit('dirty')
      })
      nord(ctx)
    })
    .use(commonmark)
    .use(history)
    .use(listener)
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
  async ([isLoading, content]) => {
    if (isLoading || hasAppliedInitialContent.value) {
      return
    }
    await nextTick()
    await applyInitialContent()
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
  <Milkdown class="milkdown-root" />
</template>

<style scoped>
.milkdown-root {
  min-height: 320px;
}

.milkdown-root :deep(.milkdown) {
  outline: none;
}

.milkdown-root :deep(.ProseMirror) {
  min-height: 280px;
}
</style>
