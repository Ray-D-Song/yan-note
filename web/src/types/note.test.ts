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
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

describe('compareNotes', () => {
  it('sorts by sort_order ascending', () => {
    const a = makeNote({ id: 'a', sort_order: 1, created_at: 100 })
    const b = makeNote({ id: 'b', sort_order: 2, created_at: 50 })
    expect(compareNotes(a, b)).toBeLessThan(0)
    expect(compareNotes(b, a)).toBeGreaterThan(0)
  })

  it('breaks ties with created_at ascending', () => {
    const older = makeNote({ id: 'older', sort_order: 0, created_at: 100 })
    const newer = makeNote({ id: 'newer', sort_order: 0, created_at: 200 })
    expect(compareNotes(older, newer)).toBeLessThan(0)
    expect(compareNotes(newer, older)).toBeGreaterThan(0)
  })
})

describe('buildNoteTree', () => {
  it('sorts siblings at each level by sort_order then created_at', () => {
    const notes = [
      makeNote({ id: 'root-b', sort_order: 1, created_at: 100 }),
      makeNote({ id: 'root-a', sort_order: 0, created_at: 200 }),
      makeNote({ id: 'child-b', parent_id: 'root-a', sort_order: 1, created_at: 50 }),
      makeNote({ id: 'child-a', parent_id: 'root-a', sort_order: 0, created_at: 100 }),
    ]

    const tree = buildNoteTree(notes)

    expect(tree.map((node) => node.id)).toEqual(['root-a', 'root-b'])
    expect(tree[0]?.children.map((node) => node.id)).toEqual(['child-a', 'child-b'])
  })

  it('treats notes with missing parent as roots', () => {
    const notes = [
      makeNote({ id: 'orphan', parent_id: 'missing', sort_order: 0, created_at: 1 }),
      makeNote({ id: 'root', sort_order: 0, created_at: 2 }),
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
