import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiRequest } from '@/api/client'
import { closeAccountDb, deleteAccountDb } from '@/lib/idb/database'
import { clearLastUserId, getLastUserId, setLastUserId } from '@/lib/sync/device-id'
import { clearNoteApiCaches } from '@/lib/pwaCache'
import { useDatabasesStore } from '@/stores/databases'
import { useNotesStore } from '@/stores/notes'
import { useSyncStore } from '@/stores/sync'
import type { User } from '@/types/note'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const initialized = ref(false)
  const loading = ref(false)
  const sessionValid = ref(true)

  const isAuthenticated = computed(() => user.value !== null)
  const canUseLocal = computed(() => {
    const lastUserId = getLastUserId()
    return lastUserId !== null
  })

  async function initLocalFirst() {
    const lastUserId = getLastUserId()
    if (!lastUserId) {
      return
    }
    const notesStore = useNotesStore()
    await notesStore.initForUser(lastUserId)
    await useDatabasesStore().init()
  }

  async function setupAfterAuth(isNewSession = false) {
    if (!user.value) return
    setLastUserId(user.value.id)
    const notesStore = useNotesStore()
    const syncStore = useSyncStore()
    await notesStore.initForUser(user.value.id)
    await useDatabasesStore().init()
    await syncStore.initForUser(user.value.id, isNewSession)
    sessionValid.value = true
  }

  async function fetchMe() {
    try {
      user.value = await apiRequest<User>('/auth/me')
      await setupAfterAuth(false)
    } catch {
      user.value = null
      sessionValid.value = false
    } finally {
      initialized.value = true
    }
  }

  async function register(email: string, password: string) {
    loading.value = true
    try {
      user.value = await apiRequest<User>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      await setupAfterAuth(true)
    } finally {
      loading.value = false
    }
  }

  async function login(email: string, password: string) {
    loading.value = true
    try {
      user.value = await apiRequest<User>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      await setupAfterAuth(true)
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await apiRequest<{ ok: boolean }>('/auth/logout', { method: 'POST' })
    } catch {
      // proceed with local cleanup even if network fails
    }

    const userId = user.value?.id ?? getLastUserId()
    if (userId) {
      await deleteAccountDb(userId)
    }
    await closeAccountDb()
    await clearNoteApiCaches()
    clearLastUserId()

    useNotesStore().reset()
    useDatabasesStore().reset()
    useSyncStore().reset()
    user.value = null
    sessionValid.value = true
  }

  return {
    user,
    initialized,
    loading,
    sessionValid,
    isAuthenticated,
    canUseLocal,
    initLocalFirst,
    setupAfterAuth,
    fetchMe,
    register,
    login,
    logout,
  }
})
