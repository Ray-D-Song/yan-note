import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getPendingOutbox, getSyncMeta, openAccountDb } from '@/lib/idb/database'
import { requestPersistentStorage } from '@/lib/idb/database'
import {
  bootstrapAccount,
  hasPendingSync,
  onSyncDataChanged,
  onSyncStateChanged,
  runSync,
  startSyncLoop,
  stopSyncLoop,
} from '@/lib/sync/engine'
import type { SyncStatus } from '@/lib/sync/types'

export const useSyncStore = defineStore('sync', () => {
  const status = ref<SyncStatus>('idle')
  const bootstrapInProgress = ref(false)
  const cloudSynced = ref(true)
  const lastError = ref<string | null>(null)
  let userId: string | null = null
  let stopLoop: (() => void) | null = null
  let unsubscribeState: (() => void) | null = null

  const statusLabel = computed(() => {
    switch (status.value) {
      case 'bootstrap':
        return '正在初始化本地笔记库...'
      case 'syncing':
        return '同步中...'
      case 'offline_pending':
        return '已保存到本机，等待同步'
      case 'auth_required':
        return '需要重新登录以同步'
      case 'error':
        return lastError.value ?? '同步失败'
      default:
        return cloudSynced.value ? '' : '已保存到本机'
    }
  })

  const showStatus = computed(
    () =>
      status.value !== 'idle' ||
      !cloudSynced.value ||
      bootstrapInProgress.value,
  )

  async function updatePendingState() {
    if (!userId) return
    cloudSynced.value = !(await hasPendingSync(userId))
    if (!navigator.onLine && !cloudSynced.value) {
      status.value = 'offline_pending'
    } else if (status.value === 'offline_pending' && cloudSynced.value) {
      status.value = 'idle'
    }
  }

  async function initForUser(uid: string, isNewSession = false) {
    userId = uid
    await requestPersistentStorage()

    const db = await openAccountDb(uid)
    const meta = await getSyncMeta(db)

    if (!meta?.bootstrap_complete || isNewSession) {
      bootstrapInProgress.value = true
      status.value = 'bootstrap'
      try {
        await bootstrapAccount(uid)
      } catch (err) {
        if (!meta?.bootstrap_complete) {
          lastError.value = '初始化失败'
          status.value = 'error'
          bootstrapInProgress.value = false
          return
        }
      }
      bootstrapInProgress.value = false
    }

    status.value = 'idle'
    await updatePendingState()
    stopLoop?.()
    stopLoop = startSyncLoop(uid)

    unsubscribeState?.()
    unsubscribeState = onSyncStateChanged((state) => {
      if (state.syncing) {
        status.value = 'syncing'
      } else if (state.error === 'auth_required') {
        status.value = 'auth_required'
      } else if (state.error) {
        status.value = 'error'
        lastError.value = state.error
      }
      void updatePendingState()
    })

    onSyncDataChanged(() => {
      void updatePendingState()
    })
  }

  async function triggerSync() {
    if (!userId) return
    status.value = 'syncing'
    const result = await runSync(userId)
    if (result.error === 'auth_required') {
      status.value = 'auth_required'
    } else if (result.error) {
      if (!navigator.onLine) {
        status.value = 'offline_pending'
      } else {
        status.value = 'error'
        lastError.value = result.error
      }
    } else {
      status.value = 'idle'
    }
    await updatePendingState()
  }

  function reset() {
    stopLoop?.()
    stopLoop = null
    unsubscribeState?.()
    unsubscribeState = null
    stopSyncLoop()
    userId = null
    status.value = 'idle'
    bootstrapInProgress.value = false
    cloudSynced.value = true
    lastError.value = null
  }

  return {
    status,
    bootstrapInProgress,
    cloudSynced,
    statusLabel,
    showStatus,
    initForUser,
    triggerSync,
    reset,
  }
})
