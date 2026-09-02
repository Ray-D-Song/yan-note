<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RiDeleteBinLine, RiEditLine } from '@remixicon/vue'

const emit = defineEmits<{
  rename: []
  delete: []
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)

function onDocumentClick(event: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    emit('close')
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick, true)
  document.removeEventListener('keydown', onKeydown)
})

function onRename(event: Event) {
  event.stopPropagation()
  emit('rename')
}

function onDelete(event: Event) {
  event.stopPropagation()
  emit('delete')
}
</script>

<template>
  <div ref="menuRef" class="note-action-menu" role="menu" @click.stop>
    <div class="note-action-menu-label">页面</div>
    <button class="note-action-menu-item" type="button" role="menuitem" @click="onRename">
      <RiEditLine size="16px" aria-hidden="true" />
      <span>重命名</span>
    </button>
    <div class="note-action-menu-divider" role="separator" />
    <button
      class="note-action-menu-item note-action-menu-item-danger"
      type="button"
      role="menuitem"
      @click="onDelete"
    >
      <RiDeleteBinLine size="16px" aria-hidden="true" />
      <span>移至垃圾箱</span>
    </button>
  </div>
</template>

<style scoped>
.note-action-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 1050;
  width: 220px;
  padding: 6px 0;
  background: #fff;
  border: 1px solid rgba(55, 53, 47, 0.09);
  border-radius: 8px;
  box-shadow:
    rgba(15, 15, 15, 0.05) 0 0 0 1px,
    rgba(15, 15, 15, 0.1) 0 3px 6px,
    rgba(15, 15, 15, 0.2) 0 9px 24px;
}

:root[data-theme='dark'] .note-action-menu {
  background: #252525;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow:
    rgba(0, 0, 0, 0.2) 0 0 0 1px,
    rgba(0, 0, 0, 0.4) 0 4px 12px;
}

.note-action-menu-label {
  padding: 4px 14px 6px;
  font-size: 0.75rem;
  color: rgba(55, 53, 47, 0.5);
}

:root[data-theme='dark'] .note-action-menu-label {
  color: rgba(255, 255, 255, 0.45);
}

.note-action-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 14px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 0.875rem;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.note-action-menu-item:hover {
  background: rgba(55, 53, 47, 0.06);
}

:root[data-theme='dark'] .note-action-menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.note-action-menu-item-danger {
  color: #eb5757;
}

:root[data-theme='dark'] .note-action-menu-item-danger {
  color: #ff7369;
}

.note-action-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: rgba(55, 53, 47, 0.09);
}

:root[data-theme='dark'] .note-action-menu-divider {
  background: rgba(255, 255, 255, 0.08);
}
</style>
