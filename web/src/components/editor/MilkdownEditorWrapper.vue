<script setup lang="ts">
import { ref } from 'vue'
import { MilkdownProvider } from '@milkdown/vue'
import MilkdownEditor from '@/components/editor/MilkdownEditor.vue'

defineProps<{
  initialContent: string
}>()

const emit = defineEmits<{
  dirty: []
  blur: []
}>()

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
  <MilkdownProvider>
    <MilkdownEditor
      ref="editorRef"
      :initial-content="initialContent"
      @dirty="emit('dirty')"
      @blur="emit('blur')"
    />
  </MilkdownProvider>
</template>
