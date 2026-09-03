import { defineComponent, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { snapshotsEqual, useNoteSync, type NoteSnapshot } from '@/composables/useNoteSync'

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
}))

type SyncApi = ReturnType<typeof useNoteSync>

function mountSync(options?: {
  noteId?: Ref<string | null>
  getSnapshot?: () => NoteSnapshot
  save?: (id: string, snapshot: NoteSnapshot) => Promise<void>
}) {
  const noteId = options?.noteId ?? ref<string | null>('note-b')
  const save =
    options?.save ??
    vi.fn<(id: string, snapshot: NoteSnapshot) => Promise<void>>().mockResolvedValue(undefined)
  const getSnapshot =
    options?.getSnapshot ??
    (() => ({
      title: '神农',
      content: 'content-a',
    }))

  let api!: SyncApi

  mount(
    defineComponent({
      setup() {
        api = useNoteSync({ noteId, getSnapshot, save })
        return () => null
      },
    }),
  )

  return { api, noteId, save, getSnapshot }
}

describe('snapshotsEqual', () => {
  it('returns true when title and content match', () => {
    expect(
      snapshotsEqual({ title: 'a', content: 'b' }, { title: 'a', content: 'b' }),
    ).toBe(true)
  })

  it('returns false when content differs', () => {
    expect(
      snapshotsEqual({ title: 'a', content: 'b' }, { title: 'a', content: 'c' }),
    ).toBe(false)
  })
})

describe('useNoteSync.flush', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves to targetId when switching notes', async () => {
    const { api, save } = mountSync()
    api.setBaseline({ title: 'old', content: 'old content' })

    await api.flush('note-a')

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('note-a', {
      title: '神农',
      content: 'content-a',
    })
  })

  it('uses current noteId when targetId is omitted', async () => {
    const { api, save } = mountSync()
    api.setBaseline({ title: 'old', content: 'old content' })

    await api.flush()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('note-b', {
      title: '神农',
      content: 'content-a',
    })
  })

  it('skips save when snapshot matches baseline', async () => {
    const snapshot = { title: '神农', content: 'content-a' }
    const { api, save } = mountSync({ getSnapshot: () => snapshot })
    api.setBaseline(snapshot)

    await api.flush()

    expect(save).not.toHaveBeenCalled()
  })

  it('serializes concurrent flush calls', async () => {
    let resolveFirst: () => void = () => {}
    const firstGate = new Promise<void>((resolve) => {
      resolveFirst = resolve
    })
    let saveCount = 0
    const save = vi
      .fn<(id: string, snapshot: NoteSnapshot) => Promise<void>>()
      .mockImplementation(async () => {
        saveCount += 1
        if (saveCount === 1) {
          await firstGate
        }
      })

    let content = 'version-1'
    const { api } = mountSync({
      save,
      getSnapshot: () => ({ title: 't', content }),
    })
    api.setBaseline({ title: 't', content: 'baseline' })

    const first = api.flush('note-a')

    await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(1)

    content = 'version-2'
    const second = api.flush('note-a')

    resolveFirst()
    await first
    await second

    expect(save).toHaveBeenCalledTimes(2)
  })
})
