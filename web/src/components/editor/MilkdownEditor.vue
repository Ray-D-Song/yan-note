<script setup lang="ts">
import { ProsemirrorAdapterProvider, useNodeViewFactory } from '@prosemirror-adapter/vue'
import { ref, watch } from 'vue'

import MilkdownEditorCore from '@/components/editor/MilkdownEditorCore.vue'
import { useThemeStore } from '@/stores/theme'

const props = defineProps<{
  initialContent: string
  noteId?: string | null
}>()

const emit = defineEmits<{
  dirty: []
  blur: []
}>()

const themeStore = useThemeStore()
const nodeViewFactory = useNodeViewFactory()
const coreRef = ref<InstanceType<typeof MilkdownEditorCore> | null>(null)
const bootContent = ref(props.initialContent)

watch(
  () => props.initialContent,
  (content) => {
    bootContent.value = content
  },
)

function onSnapshot(content: string) {
  bootContent.value = content
}

function getMarkdown(): string {
  return coreRef.value?.getMarkdown() ?? ''
}

function isReady(): boolean {
  return coreRef.value?.isReady() ?? false
}

defineExpose({
  getMarkdown,
  isReady,
})
</script>

<template>
  <ProsemirrorAdapterProvider>
    <MilkdownEditorCore
      ref="coreRef"
      :key="themeStore.colorScheme"
      :initial-content="bootContent"
      :note-id="noteId"
      :node-view-factory="nodeViewFactory"
      @dirty="emit('dirty')"
      @blur="emit('blur')"
      @snapshot="onSnapshot"
    />
  </ProsemirrorAdapterProvider>
</template>
