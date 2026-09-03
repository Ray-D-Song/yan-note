import { onMounted, onUnmounted, ref } from 'vue'
import { getStorageEstimate } from '@/lib/idb/database'

export type StorageQuotaState = {
  usage: number
  quota: number
  percent: number
  isLow: boolean
  isExceeded: boolean
}

export function useStorageQuota() {
  const state = ref<StorageQuotaState | null>(null)
  let timer: number | null = null

  async function refresh() {
    const est = await getStorageEstimate()
    if (!est) return
    const percent = est.quota > 0 ? (est.usage / est.quota) * 100 : 0
    state.value = {
      usage: est.usage,
      quota: est.quota,
      percent,
      isLow: percent > 85,
      isExceeded: percent > 95,
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  onMounted(() => {
    void refresh()
    timer = window.setInterval(() => void refresh(), 60_000)
  })

  onUnmounted(() => {
    if (timer !== null) window.clearInterval(timer)
  })

  return { state, refresh, formatBytes }
}

export function isQuotaExceededError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'QuotaExceededError'
}
