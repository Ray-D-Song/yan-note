<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Sidebar from '@/components/sidebar/Sidebar.vue'
import { useStorageQuota } from '@/composables/useStorageQuota'
import { useNotesStore } from '@/stores/notes'
import { useSyncStore } from '@/stores/sync'

const notesStore = useNotesStore()
const syncStore = useSyncStore()
const storageQuota = useStorageQuota()
const router = useRouter()

onMounted(async () => {
  if (notesStore.localReady) {
    await notesStore.fetchNotes()
  }
  if (router.currentRoute.value.name === 'home' && notesStore.notesTree.length > 0) {
    const firstNote = notesStore.notesTree[0]
    if (firstNote) {
      await router.replace({ name: 'note', params: { id: firstNote.id } })
    }
  }
})
</script>

<template>
  <div class="app-layout d-flex vh-100 overflow-hidden">
    <Sidebar />
    <main class="app-main flex-grow-1 overflow-auto position-relative">
      <div
        v-if="syncStore.showStatus || storageQuota.state.value?.isLow"
        class="sync-status-bar small px-3 py-1"
      >
        <span v-if="storageQuota.state.value?.isExceeded">
          本地存储空间不足（{{ storageQuota.formatBytes(storageQuota.state.value.usage) }} /
          {{ storageQuota.formatBytes(storageQuota.state.value.quota) }}），请释放空间
        </span>
        <span v-else-if="storageQuota.state.value?.isLow">
          本地存储已用 {{ storageQuota.state.value.percent.toFixed(0) }}%，
          {{ syncStore.statusLabel || '图片上传可能受限' }}
        </span>
        <span v-else>{{ syncStore.statusLabel }}</span>
      </div>
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #fff;
  color: #37352f;
}

:root[data-theme='dark'] .app-layout {
  background: #191919;
  color: #e6e6e6;
}

.app-main {
  background: #fff;
}

:root[data-theme='dark'] .app-main {
  background: #191919;
}

.sync-status-bar {
  background: rgba(55, 53, 47, 0.06);
  color: rgba(55, 53, 47, 0.65);
  border-bottom: 1px solid rgba(55, 53, 47, 0.08);
}

:root[data-theme='dark'] .sync-status-bar {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.55);
  border-bottom-color: rgba(255, 255, 255, 0.08);
}
</style>
