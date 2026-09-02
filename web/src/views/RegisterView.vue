<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')

async function onSubmit() {
  error.value = ''
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  try {
    await auth.register(email.value, password.value)
    await router.push('/')
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '注册失败'
  }
}
</script>

<template>
  <div class="min-vh-100 d-flex align-items-center justify-content-center bg-light">
    <div class="card shadow-sm" style="width: 400px">
      <div class="card-body p-4">
        <h1 class="h4 mb-4 text-center">注册 Yan-Note</h1>
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
              minlength="6"
              autocomplete="new-password"
            />
          </div>
          <div class="mb-3">
            <label class="form-label" for="confirmPassword">确认密码</label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              class="form-control"
              required
              minlength="6"
              autocomplete="new-password"
            />
          </div>
          <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
          <button class="btn btn-primary w-100" type="submit" :disabled="auth.loading">
            {{ auth.loading ? '注册中...' : '注册' }}
          </button>
        </form>
        <p class="text-center text-muted small mt-3 mb-0">
          已有账号？
          <router-link to="/login">登录</router-link>
        </p>
      </div>
    </div>
  </div>
</template>
