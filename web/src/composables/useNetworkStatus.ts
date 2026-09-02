import { onMounted, onUnmounted, ref } from 'vue'

export type NetworkStatusLabel = 'online' | 'offline' | 'slow'

export function useNetworkStatus() {
  const status = ref<NetworkStatusLabel>(resolveStatus())

  function resolveStatus(): NetworkStatusLabel {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 'offline'
    }
    const connection = (
      navigator as Navigator & {
        connection?: { effectiveType?: string; saveData?: boolean }
      }
    ).connection

    if (
      connection?.saveData ||
      connection?.effectiveType === 'slow-2g' ||
      connection?.effectiveType === '2g'
    ) {
      return 'slow'
    }

    return 'online'
  }

  function updateStatus() {
    status.value = resolveStatus()
  }

  onMounted(() => {
    window.addEventListener('online', updateStatus)
    window.addEventListener('offline', updateStatus)

    const connection = (
      navigator as Navigator & {
        connection?: { addEventListener?: (type: string, listener: () => void) => void }
      }
    ).connection
    connection?.addEventListener?.('change', updateStatus)
  })

  onUnmounted(() => {
    window.removeEventListener('online', updateStatus)
    window.removeEventListener('offline', updateStatus)

    const connection = (
      navigator as Navigator & {
        connection?: { removeEventListener?: (type: string, listener: () => void) => void }
      }
    ).connection
    connection?.removeEventListener?.('change', updateStatus)
  })

  return {
    status,
  }
}

export function networkStatusLabel(status: NetworkStatusLabel): string | null {
  switch (status) {
    case 'offline':
      return '离线'
    case 'slow':
      return '网络较慢'
    case 'online':
      return null
  }
}
