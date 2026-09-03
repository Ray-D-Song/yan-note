import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { setupPwaUpdate } from './composables/usePwaUpdate'
import { scheduleSync } from './lib/sync/engine'
import { useThemeStore } from './stores/theme'

import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import '@milkdown/crepe/theme/nord.css'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

useThemeStore(pinia).bindSystemPreference()

setupPwaUpdate()

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'background-sync') {
      const userId = localStorage.getItem('yan-note:last-user-id')
      if (userId) scheduleSync(userId, { reason: 'manual' })
    }
  })
}

app.mount('#app')
