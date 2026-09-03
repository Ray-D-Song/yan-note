import { describe, expect, it } from 'vitest'

import {
  buildNoteTree,
  compareNotes,
  isDescendantOfNote,
  type NoteListItem,
} from './note'

function makeNote(
  overrides: Partial<NoteListItem> & Pick<NoteListItem, 'id'>,
): NoteListItem {
  return {
    parent_id: null,
    title: overrides.id,
    icon: null,
    sort_order: 0,
    position_key: 'a00000000',
    revision: 1,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

describe('compareNotes', () => {
  it('sorts by position_key ascending', () => {
    const a = makeNote({ id: 'a', position_key: 'a00000001' })
    const b = makeNote({ id: 'b', position_key: 'a00000002' })
    expect(compareNotes(a, b)).toBeLessThan(0)
    expect(compareNotes(b, a)).toBeGreaterThan(0)
  })

  it('breaks ties with id ascending', () => {
    const a = makeNote({ id: 'aaa', position_key: 'a0' })
    const b = makeNote({ id: 'bbb', position_key: 'a0' })
    expect(compareNotes(a, b)).toBeLessThan(0)
    expect(compareNotes(b, a)).toBeGreaterThan(0)
  })
})

describe('buildNoteTree', () => {
  it('sorts siblings at each level by position_key then id', () => {
    const notes = [
      makeNote({ id: 'root-b', position_key: 'a00000001' }),
      makeNote({ id: 'root-a', position_key: 'a00000000' }),
      makeNote({ id: 'child-b', parent_id: 'root-a', position_key: 'a00000001' }),
      makeNote({ id: 'child-a', parent_id: 'root-a', position_key: 'a00000000' }),
    ]

    const tree = buildNoteTree(notes)

    expect(tree.map((node) => node.id)).toEqual(['root-a', 'root-b'])
    expect(tree[0]?.children.map((node) => node.id)).toEqual(['child-a', 'child-b'])
  })

  it('treats notes with missing parent as roots', () => {
    const notes = [
      makeNote({ id: 'orphan', parent_id: 'missing', position_key: 'a0' }),
      makeNote({ id: 'root', position_key: 'a1' }),
    ]

    const tree = buildNoteTree(notes)
    expect(tree.map((node) => node.id).sort()).toEqual(['orphan', 'root'])
  })
})

describe('isDescendantOfNote', () => {
  const notes = [
    makeNote({ id: 'a' }),
    makeNote({ id: 'b', parent_id: 'a' }),
    makeNote({ id: 'c', parent_id: 'b' }),
    makeNote({ id: 'd', parent_id: 'a' }),
  ]

  it('returns true when node is a descendant', () => {
    expect(isDescendantOfNote(notes, 'a', 'c')).toBe(true)
    expect(isDescendantOfNote(notes, 'b', 'c')).toBe(true)
  })

  it('returns false for self or unrelated nodes', () => {
    expect(isDescendantOfNote(notes, 'a', 'a')).toBe(true)
    expect(isDescendantOfNote(notes, 'a', 'd')).toBe(true)
    expect(isDescendantOfNote(notes, 'c', 'a')).toBe(false)
    expect(isDescendantOfNote(notes, 'd', 'b')).toBe(false)
  })
})
