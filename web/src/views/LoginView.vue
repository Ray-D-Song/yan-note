<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')

async function onSubmit() {
  error.value = ''
  try {
    await auth.login(email.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.push(redirect)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '登录失败'
  }
}
</script>

<template>
  <div class="min-vh-100 d-flex align-items-center justify-content-center bg-light">
    <div class="card shadow-sm" style="width: 400px">
      <div class="card-body p-4">
        <h1 class="h4 mb-4 text-center">登录 Yan</h1>
        <form @submit.prevent="onSubmit">
          <div class="mb-3">
            <label class="form-label" for="email">邮箱</label>
            <input
              id="email"
              v-model="email"
              type="email"
              class="form-control"
              required
              autocomplete="email"
            />
          </div>
          <div class="mb-3">
            <label class="form-label" for="password">密码</label>
            <input
              id="password"
              v-model="password"
              type="password"
              class="form-control"
              required
              autocomplete="current-password"
            />
          </div>
          <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
          <button class="btn btn-primary w-100" type="submit" :disabled="auth.loading">
            {{ auth.loading ? '登录中...' : '登录' }}
          </button>
        </form>
        <p class="text-center text-muted small mt-3 mb-0">
          还没有账号？
          <router-link to="/register">注册</router-link>
        </p>
      </div>
    </div>
  </div>
</template>
