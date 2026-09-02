<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const title = computed(() =>
  typeof route.meta.title === 'string' ? route.meta.title : '页面',
)
</script>

<template>
  <div class="placeholder-view d-flex align-items-center justify-content-center h-100">
    <div class="text-center text-muted">
      <h2 class="h4 mb-2">{{ title }}</h2>
      <p class="mb-0">功能开发中，敬请期待</p>
    </div>
  </div>
</template>

<style scoped>
.placeholder-view {
  min-height: 100%;
}
</style>
