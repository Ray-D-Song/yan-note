import { ref, watch, type Ref } from 'vue'
import { apiRequest } from '@/api/client'
import { updateNoteLocal } from '@/lib/local-notes'
import { lineDiff } from '@/lib/sync/merge'

export type NoteVersionItem = {
  id: string
  revision: number
  field_name: string
  device_id: string
  created_at: number
}

export type NoteVersionDetail = NoteVersionItem & {
  note_id: string
  snapshot: {
    title?: string
    content?: string
    icon?: string | null
  }
}

export function useNoteVersions(noteId: Ref<string | null>) {
  const versions = ref<NoteVersionItem[]>([])
  const loading = ref(false)
  const selected = ref<NoteVersionDetail | null>(null)

  async function fetchVersions() {
    if (!noteId.value) {
      versions.value = []
      return
    }
    loading.value = true
    try {
      versions.value = await apiRequest<NoteVersionItem[]>(`/notes/${noteId.value}/versions`)
    } finally {
      loading.value = false
    }
  }

  async function fetchVersionDetail(versionId: string) {
    if (!noteId.value) return null
    selected.value = await apiRequest<NoteVersionDetail>(
      `/notes/${noteId.value}/versions/${versionId}`,
    )
    return selected.value
  }

  async function restoreVersion(userId: string, version: NoteVersionDetail) {
    if (!noteId.value) return
    const snapshot = version.snapshot
    await updateNoteLocal(userId, noteId.value, {
      title: snapshot.title,
      content: snapshot.content,
    })
  }

  watch(noteId, () => {
    void fetchVersions()
  })

  return {
    versions,
    loading,
    selected,
    fetchVersions,
    fetchVersionDetail,
    restoreVersion,
  }
}

export function formatVersionTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN')
}

export function diffLines(before: string, after: string): Array<{ type: 'add' | 'remove' | 'same'; line: string }> {
  return lineDiff(before, after)
}
