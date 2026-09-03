import { describe, expect, it } from 'vitest'
import { diffLines } from '@/composables/useNoteVersions'

describe('diffLines', () => {
  it('marks added and removed lines', () => {
    const result = diffLines('line1\nline2', 'line1\nline3')
    expect(result.some((l) => l.type === 'remove' && l.line === 'line2')).toBe(true)
    expect(result.some((l) => l.type === 'add' && l.line === 'line3')).toBe(true)
    expect(result.some((l) => l.type === 'same' && l.line === 'line1')).toBe(true)
  })
})
