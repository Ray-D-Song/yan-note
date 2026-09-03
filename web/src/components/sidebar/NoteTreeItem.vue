<script setup lang="ts">
import { computed, inject, nextTick, ref, watch, type Ref } from 'vue'
import { RiAddLine, RiArrowRightSLine, RiDraggable, RiMoreLine } from '@remixicon/vue'
import NoteTreeList from '@/components/sidebar/NoteTreeList.vue'
import { useRoute, useRouter } from 'vue-router'
import NoteIcon from '@/components/common/NoteIcon.vue'
import NoteActionMenu from '@/components/sidebar/NoteActionMenu.vue'
import type { NoteTreeNode } from '@/types/note'
import { useNotesStore } from '@/stores/notes'

const props = defineProps<{
  node: NoteTreeNode
}>()

const route = useRoute()
const router = useRouter()
const notesStore = useNotesStore()

const openMenuId = inject<Ref<string | null>>('noteTreeOpenMenuId')!
const setOpenMenuId = inject<(id: string | null) => void>('noteTreeSetOpenMenuId')!
const collapsedIds = inject<Ref<Set<string>>>('noteTreeCollapsedIds')!
const toggleCollapsed = inject<(id: string) => void>('noteTreeToggleCollapsed')!
const expandNode = inject<(id: string) => void>('noteTreeExpandNode')!

const isRenaming = ref(false)
const renameDraft = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)
const menuAnchorRef = ref<HTMLElement | null>(null)

const isActive = computed(() => route.params.id === props.node.id)
const isMenuOpen = computed(() => openMenuId.value === props.node.id)
const hasChildren = computed(() => props.node.children.length > 0)
const isExpanded = computed(() => !collapsedIds.value.has(props.node.id))

const hasActiveDescendant = computed(() => {
  const currentId = route.params.id
  if (typeof currentId !== 'string') {
    return false
  }
  return nodeContainsId(props.node, currentId) && currentId !== props.node.id
})

function nodeContainsId(node: NoteTreeNode, id: string): boolean {
  if (node.id === id) {
    return true
  }
  return node.children.some((child) => nodeContainsId(child, id))
}

watch(
  hasActiveDescendant,
  (active) => {
    if (active) {
      expandNode(props.node.id)
    }
  },
  { immediate: true },
)

function toggleExpand(event: Event) {
  stopRowClick(event)
  toggleCollapsed(props.node.id)
}

async function openNote() {
  if (isRenaming.value) {
    return
  }
  await router.push({ name: 'note', params: { id: props.node.id } })
}

function stopRowClick(event: Event) {
  event.stopPropagation()
}

async function createChildNote(event: Event) {
  stopRowClick(event)
  setOpenMenuId(null)
  expandNode(props.node.id)
  const note = await notesStore.createNote({ parent_id: props.node.id })
  await router.push({ name: 'note', params: { id: note.id } })
}

function toggleMenu(event: Event) {
  stopRowClick(event)
  setOpenMenuId(isMenuOpen.value ? null : props.node.id)
}

function closeMenu() {
  setOpenMenuId(null)
}

async function startRename() {
  closeMenu()
  isRenaming.value = true
  renameDraft.value = props.node.title
  await nextTick()
  renameInputRef.value?.focus()
  renameInputRef.value?.select()
}

async function commitRename() {
  if (!isRenaming.value) {
    return
  }
  const nextTitle = renameDraft.value.trim() || '无标题'
  isRenaming.value = false
  if (nextTitle !== props.node.title) {
    await notesStore.updateNote(props.node.id, { title: nextTitle })
  }
}

function cancelRename() {
  isRenaming.value = false
  renameDraft.value = props.node.title
}

function onRenameKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    void commitRename()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelRename()
  }
}

async function deleteNote() {
  closeMenu()
  if (!confirm('确定删除这条笔记及其子笔记吗？')) {
    return
  }
  await notesStore.deleteNote(props.node.id)
  if (route.params.id === props.node.id) {
    const next = notesStore.notesTree[0]
    if (next) {
      await router.push({ name: 'note', params: { id: next.id } })
    } else {
      await router.push({ name: 'home' })
    }
  }
}
</script>

<template>
  <li class="note-tree-item">
    <div
      class="note-tree-row d-flex align-items-center rounded px-2 py-1"
      :class="{ active: isActive, 'is-menu-open': isMenuOpen, 'is-renaming': isRenaming }"
      role="button"
      @click="openNote"
    >
      <button
        class="note-tree-drag-handle"
        type="button"
        aria-label="拖拽排序"
        title="拖拽排序"
        @click.stop
      >
        <RiDraggable size="16px" aria-hidden="true" />
      </button>

      <button
        class="note-tree-toggle"
        type="button"
        :aria-expanded="isExpanded"
        aria-label="展开或折叠子页面"
        @click="toggleExpand"
      >
        <RiArrowRightSLine
          class="note-tree-toggle-icon"
          :class="{ expanded: isExpanded }"
          size="16px"
          aria-hidden="true"
        />
      </button>

      <span class="me-2 note-tree-icon">
        <NoteIcon />
      </span>

      <input
        v-if="isRenaming"
        ref="renameInputRef"
        v-model="renameDraft"
        class="note-tree-rename-input flex-grow-1 small"
        type="text"
        @click.stop
        @keydown="onRenameKeydown"
        @blur="commitRename"
      />
      <span v-else class="flex-grow-1 text-truncate small">{{ node.title }}</span>

      <div
        class="note-tree-actions"
        :class="{ visible: isMenuOpen }"
        @click.stop
      >
        <button
          class="note-tree-action-btn"
          type="button"
          title="添加子页面"
          aria-label="添加子页面"
          @click="createChildNote"
        >
          <RiAddLine size="16px" aria-hidden="true" />
        </button>
        <div ref="menuAnchorRef" class="note-tree-menu-anchor">
          <button
            class="note-tree-action-btn"
            type="button"
            title="删除、重命名等..."
            aria-label="更多操作"
            aria-haspopup="menu"
            :aria-expanded="isMenuOpen"
            @click="toggleMenu"
          >
            <RiMoreLine size="16px" aria-hidden="true" />
          </button>
          <NoteActionMenu
            v-if="isMenuOpen"
            :anchor-el="menuAnchorRef"
            @close="closeMenu"
            @rename="startRename"
            @delete="deleteNote"
          />
        </div>
      </div>
    </div>

    <NoteTreeList
      v-if="isExpanded"
      nested
      :parent-id="node.id"
      :nodes="node.children"
    />
  </li>
</template>

<style scoped>
.note-tree-row {
  position: relative;
  cursor: pointer;
  color: #37352f;
}

.note-tree-row:hover,
.note-tree-row.is-menu-open {
  background: rgba(0, 0, 0, 0.04);
}

.note-tree-row.active {
  background: rgba(0, 0, 0, 0.08);
}

.note-tree-row.is-renaming {
  background: rgba(0, 0, 0, 0.04);
}

.note-tree-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-right: 2px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: rgba(55, 53, 47, 0.45);
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.note-tree-toggle:hover {
  background: rgba(55, 53, 47, 0.08);
  color: rgba(55, 53, 47, 0.75);
}

.note-tree-toggle-icon {
  transition: transform 0.15s ease;
}

.note-tree-toggle-icon.expanded {
  transform: rotate(90deg);
}

.note-tree-drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 20px;
  margin-right: 2px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: rgba(55, 53, 47, 0.35);
  flex-shrink: 0;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}

.note-tree-row:hover .note-tree-drag-handle,
.note-tree-row.is-menu-open .note-tree-drag-handle {
  opacity: 1;
}

.note-tree-drag-handle:active {
  cursor: grabbing;
}

.note-tree-drag-handle:hover {
  background: rgba(55, 53, 47, 0.08);
  color: rgba(55, 53, 47, 0.65);
}

.note-tree-icon {
  display: inline-flex;
  align-items: center;
  color: inherit;
  flex-shrink: 0;
}

.note-tree-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.note-tree-row:hover .note-tree-actions,
.note-tree-actions.visible {
  opacity: 1;
  pointer-events: auto;
}

.note-tree-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: rgba(55, 53, 47, 0.55);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.note-tree-action-btn:hover {
  background: rgba(55, 53, 47, 0.08);
  color: rgba(55, 53, 47, 0.9);
}

.note-tree-menu-anchor {
  position: relative;
}

.note-tree-rename-input {
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  outline: none;
  box-shadow: none;
}

:root[data-theme='dark'] .note-tree-row {
  color: #e6e6e6;
}

:root[data-theme='dark'] .note-tree-row:hover,
:root[data-theme='dark'] .note-tree-row.is-menu-open,
:root[data-theme='dark'] .note-tree-row.is-renaming {
  background: rgba(255, 255, 255, 0.06);
}

:root[data-theme='dark'] .note-tree-row.active {
  background: rgba(255, 255, 255, 0.1);
}

:root[data-theme='dark'] .note-tree-drag-handle {
  color: rgba(255, 255, 255, 0.35);
}

:root[data-theme='dark'] .note-tree-drag-handle:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.65);
}

:root[data-theme='dark'] .note-tree-toggle {
  color: rgba(255, 255, 255, 0.4);
}

:root[data-theme='dark'] .note-tree-toggle:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.75);
}

:root[data-theme='dark'] .note-tree-action-btn {
  color: rgba(255, 255, 255, 0.5);
}

:root[data-theme='dark'] .note-tree-action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}
</style>
