import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

export type SyncStatus = 'local_saved' | 'dirty' | 'saving' | 'error'

export type NoteSnapshot = {
  title: string
  content: string
}

type UseNoteSyncOptions = {
  noteId: Ref<string | null>
  getSnapshot: () => NoteSnapshot
  save: (id: string, snapshot: NoteSnapshot) => Promise<void>
  isReady?: () => boolean
  debounceMs?: number
}

function snapshotsEqual(a: NoteSnapshot, b: NoteSnapshot): boolean {
  return a.title === b.title && a.content === b.content
}

export function useNoteSync(options: UseNoteSyncOptions) {
  const status = ref<SyncStatus>('local_saved')
  const lastSaved = ref<NoteSnapshot>({ title: '', content: '' })
  let timer: number | null = null

  function clearTimer() {
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  function setBaseline(snapshot: NoteSnapshot) {
    lastSaved.value = { ...snapshot }
    status.value = 'local_saved'
    clearTimer()
  }

  function markDirty() {
    if (status.value !== 'saving') {
      status.value = 'dirty'
    }
    scheduleFlush()
  }

  function scheduleFlush() {
    clearTimer()
    timer = window.setTimeout(() => {
      void flush()
    }, options.debounceMs ?? 300)
  }

  async function flush(): Promise<boolean> {
    clearTimer()

    const id = options.noteId.value
    if (!id) {
      status.value = 'local_saved'
      return true
    }

    const snapshot = options.getSnapshot()
    if (
      options.isReady &&
      !options.isReady() &&
      snapshot.content === '' &&
      lastSaved.value.content !== ''
    ) {
      status.value = 'dirty'
      scheduleFlush()
      return false
    }

    if (snapshotsEqual(snapshot, lastSaved.value)) {
      status.value = 'local_saved'
      return true
    }

    status.value = 'saving'
    try {
      await options.save(id, snapshot)
      lastSaved.value = { ...snapshot }
      status.value = 'local_saved'
      return true
    } catch {
      status.value = 'error'
      return false
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden' && status.value !== 'local_saved') {
      void flush()
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onBeforeUnmount(() => {
    clearTimer()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  onBeforeRouteLeave(async () => {
    if (status.value === 'local_saved') {
      return true
    }
    return flush()
  })

  return {
    status,
    setBaseline,
    markDirty,
    flush,
  }
}

export function syncStatusLabel(status: SyncStatus): string {
  switch (status) {
    case 'local_saved':
      return '已保存到本机'
    case 'dirty':
      return '编辑中'
    case 'saving':
      return '保存中...'
    case 'error':
      return '保存失败'
  }
}
