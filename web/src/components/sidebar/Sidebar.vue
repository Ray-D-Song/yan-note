<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import NoteTree from '@/components/sidebar/NoteTree.vue'
import { useAuthStore } from '@/stores/auth'
import { useNotesStore } from '@/stores/notes'
import { useThemeStore } from '@/stores/theme'

const auth = useAuthStore()
const notesStore = useNotesStore()
const themeStore = useThemeStore()
const router = useRouter()

const themeToggleLabel = computed(() =>
  themeStore.colorScheme === 'dark' ? '浅色模式' : '深色模式',
)

async function createNote() {
  const note = await notesStore.createNote()
  await router.push({ name: 'note', params: { id: note.id } })
}

async function logout() {
  await auth.logout()
  await router.push('/login')
}
</script>

<template>
  <aside class="sidebar d-flex flex-column border-end">
    <div class="p-3 border-bottom">
      <div class="input-group input-group-sm mb-2">
        <span class="input-group-text sidebar-input-addon">🔍</span>
        <input class="form-control sidebar-input" type="search" placeholder="搜索或询问" disabled />
        <span class="input-group-text sidebar-input-addon text-muted small">Ctrl+K</span>
      </div>
      <button class="btn btn-sm btn-outline-secondary w-100 mb-2" type="button" @click="createNote">
        + 新建笔记
      </button>
      <button class="btn btn-sm btn-outline-secondary w-100" type="button" @click="themeStore.toggle()">
        {{ themeToggleLabel }}
      </button>
    </div>

    <div class="flex-grow-1 overflow-auto px-2 py-2">
      <div class="text-muted text-uppercase small px-2 mb-2">私人</div>
      <NoteTree v-if="notesStore.notesTree.length" :nodes="notesStore.notesTree" />
      <p v-else class="text-muted small px-2 mb-0">暂无笔记，点击上方按钮创建</p>
    </div>

    <div class="p-3 border-top mt-auto">
      <div class="d-flex align-items-center justify-content-between">
        <span class="small text-truncate">{{ auth.user?.email }}</span>
        <button class="btn btn-sm btn-link text-decoration-none" type="button" @click="logout">
          退出
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  min-width: 260px;
  background: #f7f6f3;
  color: #37352f;
}

:root[data-theme='dark'] .sidebar {
  background: #202020;
  color: #e6e6e6;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.sidebar-input,
.sidebar-input-addon {
  background: #fff;
  color: inherit;
  border-color: rgba(55, 53, 47, 0.16);
}

:root[data-theme='dark'] .sidebar-input,
:root[data-theme='dark'] .sidebar-input-addon {
  background: #2a2a2a;
  border-color: rgba(255, 255, 255, 0.12);
  color: #e6e6e6;
}
</style>
