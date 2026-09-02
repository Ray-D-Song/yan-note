import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiRequest } from '@/api/client'
import { clearNoteApiCaches } from '@/lib/pwaCache'
import type { User } from '@/types/note'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const initialized = ref(false)
  const loading = ref(false)

  const isAuthenticated = computed(() => user.value !== null)

  async function fetchMe() {
    try {
      user.value = await apiRequest<User>('/auth/me')
    } catch {
      user.value = null
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
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await apiRequest<{ ok: boolean }>('/auth/logout', { method: 'POST' })
    await clearNoteApiCaches()
    user.value = null
  }

  return {
    user,
    initialized,
    loading,
    isAuthenticated,
    fetchMe,
    register,
    login,
    logout,
  }
})
