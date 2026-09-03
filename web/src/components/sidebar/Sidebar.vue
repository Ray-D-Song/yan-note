<script setup lang="ts">
import { computed } from 'vue'
import {
  RiCalendarLine,
  RiDeleteBinLine,
  RiEditBoxLine,
  RiListCheck,
  RiMoonLine,
  RiSearchLine,
  RiSettings3Line,
  RiSunLine,
} from '@remixicon/vue'
import { useRoute, useRouter } from 'vue-router'
import NoteTree from '@/components/sidebar/NoteTree.vue'
import { useAuthStore } from '@/stores/auth'
import { useNotesStore } from '@/stores/notes'
import { useThemeStore } from '@/stores/theme'

const auth = useAuthStore()
const notesStore = useNotesStore()
const themeStore = useThemeStore()
const router = useRouter()
const route = useRoute()

const themeToggleLabel = computed(() =>
  themeStore.colorScheme === 'dark' ? '浅色模式' : '深色模式',
)

const ThemeToggleIcon = computed(() =>
  themeStore.colorScheme === 'dark' ? RiSunLine : RiMoonLine,
)

const footerNavItems = [
  { name: 'list' as const, label: '清单', icon: RiListCheck },
  { name: 'calendar' as const, label: '日历', icon: RiCalendarLine },
  { name: 'trash' as const, label: '回收站', icon: RiDeleteBinLine },
  { name: 'settings' as const, label: '设置', icon: RiSettings3Line },
]

function isNavActive(name: string) {
  return route.name === name
}

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
    <div class="sidebar-header p-3 pt-1 border-bottom">
      <div class="sidebar-toolbar">
        <button
          class="sidebar-icon-btn"
          type="button"
          :aria-label="themeToggleLabel"
          :title="themeToggleLabel"
          @click="themeStore.toggle()"
        >
          <component :is="ThemeToggleIcon" size="18px" aria-hidden="true" />
        </button>
        <button
          class="sidebar-icon-btn"
          type="button"
          aria-label="新建笔记"
          title="新建笔记"
          @click="createNote"
        >
          <RiEditBoxLine size="18px" aria-hidden="true" />
        </button>
      </div>
      <div class="input-group input-group-sm">
        <span class="input-group-text sidebar-input-addon">
          <RiSearchLine size="16px" aria-hidden="true" />
        </span>
        <input class="form-control sidebar-input" type="search" placeholder="搜索或询问" disabled />
        <span class="input-group-text sidebar-input-addon text-muted small">Ctrl+K</span>
      </div>
    </div>

    <div class="flex-grow-1 overflow-auto px-2 py-2">
      <div class="text-muted text-uppercase small px-2 mb-2">私人</div>
      <NoteTree v-if="notesStore.notesTree.length" :nodes="notesStore.notesTree" />
      <p v-else class="text-muted small px-2 mb-0">暂无笔记，点击上方按钮创建</p>
    </div>

    <div class="sidebar-footer mt-auto">
      <nav class="sidebar-footer-nav px-2 py-2 border-top" aria-label="快捷导航">
        <RouterLink
          v-for="item in footerNavItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="sidebar-footer-item"
          :class="{ active: isNavActive(item.name) }"
        >
          <component :is="item.icon" size="16px" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-profile px-3 py-3 border-top">
        <div class="d-flex align-items-center justify-content-between gap-2">
          <span class="small text-truncate">{{ auth.user?.email }}</span>
          <button class="btn btn-sm btn-link text-decoration-none sidebar-logout p-0" type="button" @click="logout">
            退出
          </button>
        </div>
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

.sidebar-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  margin-bottom: 8px;
}

.sidebar-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(55, 53, 47, 0.65);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.sidebar-icon-btn:hover {
  background: rgba(55, 53, 47, 0.06);
  color: rgba(55, 53, 47, 0.9);
}

:root[data-theme='dark'] .sidebar-icon-btn {
  color: rgba(255, 255, 255, 0.55);
}

:root[data-theme='dark'] .sidebar-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.sidebar-header {
  border-color: rgba(55, 53, 47, 0.09) !important;
}

:root[data-theme='dark'] .sidebar-header {
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.sidebar-header .input-group {
  background: #fff;
  border: 1px solid rgba(55, 53, 47, 0.16);
  border-radius: 6px;
  overflow: hidden;
}

.sidebar-input,
.sidebar-input-addon {
  background: transparent;
  color: inherit;
  border: none;
  box-shadow: none;
}

.sidebar-header .form-control.sidebar-input:disabled {
  background-color: transparent;
  color: inherit;
  opacity: 1;
}

:root[data-theme='dark'] .sidebar-header .input-group {
  background: #2a2a2a;
  border-color: rgba(255, 255, 255, 0.12);
}

:root[data-theme='dark'] .sidebar-input,
:root[data-theme='dark'] .sidebar-input-addon {
  color: #e6e6e6;
}

.sidebar-footer-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-footer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  color: inherit;
  text-decoration: none;
  font-size: 0.875rem;
  line-height: 1.4;
  transition: background-color 0.15s ease;
}

.sidebar-footer-item:hover {
  background: rgba(55, 53, 47, 0.06);
  color: inherit;
}

.sidebar-footer-item.active {
  background: rgba(55, 53, 47, 0.08);
  font-weight: 500;
}

:root[data-theme='dark'] .sidebar-footer-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

:root[data-theme='dark'] .sidebar-footer-item.active {
  background: rgba(255, 255, 255, 0.1);
}

.sidebar-profile,
.sidebar-footer-nav {
  border-color: rgba(55, 53, 47, 0.09) !important;
}

:root[data-theme='dark'] .sidebar-profile,
:root[data-theme='dark'] .sidebar-footer-nav {
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.sidebar-logout {
  flex-shrink: 0;
  color: #2383e2;
}

:root[data-theme='dark'] .sidebar-logout {
  color: #9ecbff;
}
</style>
