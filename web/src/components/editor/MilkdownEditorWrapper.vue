<script setup lang="ts">
import { MilkdownProvider } from '@milkdown/vue'
import MilkdownEditor from '@/components/editor/MilkdownEditor.vue'

defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <MilkdownProvider>
    <MilkdownEditor :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" />
  </MilkdownProvider>
</template>
