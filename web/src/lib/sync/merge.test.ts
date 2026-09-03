import { describe, expect, it } from 'vitest'
import { lineDiff, mergeRemoteNote } from '@/lib/sync/merge'
import type { LocalNote } from '@/lib/sync/types'

describe('lineDiff', () => {
  it('finds minimal edits for small inputs', () => {
    const diff = lineDiff('a\nb\nc', 'a\nx\nc')
    expect(diff).toEqual([
      { type: 'same', line: 'a' },
      { type: 'remove', line: 'b' },
      { type: 'add', line: 'x' },
      { type: 'same', line: 'c' },
    ])
  })

  it('falls back without allocating huge LCS table', () => {
    const before = Array.from({ length: 600 }, (_, i) => `before-${i}`).join('\n')
    const after = Array.from({ length: 600 }, (_, i) => `after-${i}`).join('\n')
    const diff = lineDiff(before, after)
    expect(diff.some((d) => d.type === 'remove')).toBe(true)
    expect(diff.some((d) => d.type === 'add')).toBe(true)
    expect(diff.filter((d) => d.type === 'same')).toHaveLength(0)
  })
})

describe('mergeRemoteNote', () => {
  const baseNote: LocalNote = {
    id: 'note-1',
    parent_id: 'root',
    title: 'Title',
    content: '',
    icon: null,
    position_key: 'a0',
    revision: 3,
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    title_clock: { adjusted_ms: 1, counter: 0, device_id: 'a' },
    content_clock: { adjusted_ms: 1, counter: 0, device_id: 'a' },
    icon_clock: null,
    parent_clock: { adjusted_ms: 999999, counter: 99, device_id: 'client' },
    position_clock: { adjusted_ms: 1, counter: 0, device_id: 'a' },
  }

  it('applies authoritative purge reparent without HLC comparison', () => {
    const merged = mergeRemoteNote(
      baseNote,
      {
        parent_id: null,
        parent_clock: null,
        authoritative: 1,
      },
      4,
      [],
    )
    expect(merged.parent_id).toBeNull()
    expect(merged.parent_clock).toBeNull()
    expect(merged.revision).toBe(4)
  })
})
