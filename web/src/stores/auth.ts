import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiRequest } from '@/api/client'
import type { User } from '@/types/note'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const initialized = ref(false)
  const loading = ref(false)

  const isAuthenticated = computed(() => user.value !== null)

  async function fetchMe() {
    try {
      user.value = await apiRequest<User>('/api/auth/me')
    } catch {
      user.value = null
    } finally {
      initialized.value = true
    }
  }

  async function register(email: string, password: string) {
    loading.value = true
    try {
      user.value = await apiRequest<User>('/api/auth/register', {
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
      user.value = await apiRequest<User>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
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
