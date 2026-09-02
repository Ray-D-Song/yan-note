<script setup lang="ts">
import { ref } from 'vue'
import { MilkdownProvider } from '@milkdown/vue'
import MilkdownEditor from '@/components/editor/MilkdownEditor.vue'
import { useThemeStore } from '@/stores/theme'

defineProps<{
  initialContent: string
  noteId?: string | null
}>()

const emit = defineEmits<{
  dirty: []
  blur: []
}>()

const themeStore = useThemeStore()
const editorRef = ref<InstanceType<typeof MilkdownEditor> | null>(null)

function getMarkdown(): string {
  return editorRef.value?.getMarkdown() ?? ''
}

function isReady(): boolean {
  return editorRef.value?.isReady() ?? false
}

defineExpose({
  getMarkdown,
  isReady,
})
</script>

<template>
  <MilkdownProvider :key="themeStore.colorScheme">
    <MilkdownEditor
      ref="editorRef"
      :initial-content="initialContent"
      :note-id="noteId"
      @dirty="emit('dirty')"
      @blur="emit('blur')"
    />
  </MilkdownProvider>
</template>
