<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Sidebar from '@/components/sidebar/Sidebar.vue'
import { useNotesStore } from '@/stores/notes'

const notesStore = useNotesStore()
const router = useRouter()

onMounted(async () => {
  await notesStore.fetchNotes()
  if (router.currentRoute.value.name === 'home' && notesStore.notes.length > 0) {
    const firstNote = notesStore.notes[0]
    if (firstNote) {
      await router.replace({ name: 'note', params: { id: firstNote.id } })
    }
  }
})
</script>

<template>
  <div class="app-layout d-flex vh-100 overflow-hidden">
    <Sidebar />
    <main class="app-main flex-grow-1 overflow-auto">
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
</style>
