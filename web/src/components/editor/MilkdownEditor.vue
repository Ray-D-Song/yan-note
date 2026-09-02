<script setup lang="ts">
import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { nord } from '@milkdown/theme-nord'
import { Milkdown, useEditor } from '@milkdown/vue'
import { watch } from 'vue'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { get, loading } = useEditor((root) => {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, props.modelValue)
      ctx.inject(listenerCtx)
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
        emit('update:modelValue', markdown)
      })
      nord(ctx)
    })
    .use(commonmark)
    .use(history)
    .use(listener)
})

watch(
  () => props.modelValue,
  async (value) => {
    const editor = get()
    if (!editor || loading.value) {
      return
    }
    const current = editor.action((ctx) => ctx.get(defaultValueCtx))
    if (current !== value) {
      await editor.action((ctx) => {
        ctx.set(defaultValueCtx, value)
      })
    }
  },
)
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
</style>
