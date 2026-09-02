import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

const needRefresh = ref(false)
const offlineReady = ref(false)
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined

export function setupPwaUpdate() {
  if (import.meta.env.DEV || updateServiceWorker) {
    return
  }

  updateServiceWorker = registerSW({
    onNeedRefresh() {
      needRefresh.value = true
    },
    onOfflineReady() {
      offlineReady.value = true
    },
  })
}

export function usePwaUpdate() {
  async function applyUpdate() {
    await updateServiceWorker?.(true)
    needRefresh.value = false
  }

  function dismissOfflineReady() {
    offlineReady.value = false
  }

  return {
    needRefresh,
    offlineReady,
    applyUpdate,
    dismissOfflineReady,
  }
}
