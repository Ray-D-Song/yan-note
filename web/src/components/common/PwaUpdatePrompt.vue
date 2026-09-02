<script setup lang="ts">
import { usePwaUpdate } from '@/composables/usePwaUpdate'

const { needRefresh, offlineReady, applyUpdate, dismissOfflineReady } = usePwaUpdate()
</script>

<template>
  <div v-if="needRefresh || offlineReady" class="pwa-prompt">
    <div class="pwa-prompt-card">
      <p v-if="needRefresh" class="pwa-prompt-text mb-0">有新版本可用</p>
      <p v-else class="pwa-prompt-text mb-0">应用已可离线打开</p>
      <div class="pwa-prompt-actions">
        <button
          v-if="needRefresh"
          class="pwa-prompt-btn pwa-prompt-btn-primary"
          type="button"
          @click="applyUpdate"
        >
          刷新
        </button>
        <button
          v-else
          class="pwa-prompt-btn"
          type="button"
          @click="dismissOfflineReady"
        >
          知道了
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pwa-prompt {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 1100;
}

.pwa-prompt-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid rgba(55, 53, 47, 0.12);
  border-radius: 8px;
  background: #fff;
  box-shadow:
    rgba(15, 15, 15, 0.05) 0 0 0 1px,
    rgba(15, 15, 15, 0.1) 0 3px 6px,
    rgba(15, 15, 15, 0.15) 0 9px 24px;
}

.pwa-prompt-text {
  font-size: 0.875rem;
  color: #37352f;
}

.pwa-prompt-actions {
  display: flex;
  gap: 8px;
}

.pwa-prompt-btn {
  padding: 4px 10px;
  border: 1px solid rgba(55, 53, 47, 0.16);
  border-radius: 6px;
  background: transparent;
  color: #37352f;
  font-size: 0.8125rem;
  cursor: pointer;
}

.pwa-prompt-btn-primary {
  border-color: #2383e2;
  background: #2383e2;
  color: #fff;
}

:root[data-theme='dark'] .pwa-prompt-card {
  background: #252525;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow:
    rgba(0, 0, 0, 0.2) 0 0 0 1px,
    rgba(0, 0, 0, 0.4) 0 4px 12px;
}

:root[data-theme='dark'] .pwa-prompt-text {
  color: #e6e6e6;
}

:root[data-theme='dark'] .pwa-prompt-btn {
  border-color: rgba(255, 255, 255, 0.16);
  color: #e6e6e6;
}
</style>
