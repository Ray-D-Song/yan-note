<script setup lang="ts">
import { RiFileTextLine } from '@remixicon/vue'

defineProps<{
  size?: string
}>()
</script>

<template>
  <RiFileTextLine :size="size ?? '16px'" class="note-icon" aria-hidden="true" />
</template>

<style scoped>
.note-icon {
  display: inline-block;
  vertical-align: -0.15em;
}
</style>
