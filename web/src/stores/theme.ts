import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type ColorScheme = 'light' | 'dark'
export type ThemePreference = ColorScheme | 'system'

const STORAGE_KEY = 'yan-note-theme'

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }
  return 'system'
}

function readSystemScheme(): ColorScheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyDocumentTheme(colorScheme: ColorScheme) {
  document.documentElement.dataset.theme = colorScheme
  document.documentElement.style.colorScheme = colorScheme
}

export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>(readStoredPreference())
  const systemScheme = ref<ColorScheme>(readSystemScheme())

  const colorScheme = computed<ColorScheme>(() =>
    preference.value === 'system' ? systemScheme.value : preference.value,
  )

  watch(
    colorScheme,
    (scheme) => {
      applyDocumentTheme(scheme)
    },
    { immediate: true },
  )

  function bindSystemPreference() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemScheme = (event: MediaQueryList | MediaQueryListEvent) => {
      systemScheme.value = event.matches ? 'dark' : 'light'
    }

    updateSystemScheme(mediaQuery)
    mediaQuery.addEventListener('change', updateSystemScheme)
  }

  function setPreference(next: ThemePreference) {
    preference.value = next
    if (next === 'system') {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(STORAGE_KEY, next)
  }

  function toggle() {
    setPreference(colorScheme.value === 'light' ? 'dark' : 'light')
  }

  return {
    preference,
    colorScheme,
    bindSystemPreference,
    setPreference,
    toggle,
  }
})
