import { describe, expect, it } from 'vitest'
import { comparePositionKeys, generatePositionKey, sortOrderToPositionKey } from '@/lib/sync/position-key'

describe('position_key', () => {
  it('generates key between two siblings', () => {
    const before = 'a0'
    const after = 'a2'
    const mid = generatePositionKey(before, after)
    expect(comparePositionKeys(before, mid)).toBeLessThan(0)
    expect(comparePositionKeys(mid, after)).toBeLessThan(0)
  })

  it('generates key at start of list', () => {
    const first = generatePositionKey(null, 'a1')
    expect(comparePositionKeys(first, 'a1')).toBeLessThan(0)
  })

  it('generates key at end of list', () => {
    const last = generatePositionKey('a9', null)
    expect(comparePositionKeys('a9', last)).toBeLessThan(0)
  })

  it('generates default for empty list', () => {
    expect(generatePositionKey(null, null)).toBe('a0')
  })

  it('supports migrated sort_order keys for head, middle, and tail insert', () => {
    const keys = [0, 1, 2, 10].map((order) => sortOrderToPositionKey(order))
    expect(keys).toEqual(['a0', 'a1', 'a2', 'aA'])

    const head = generatePositionKey(null, keys[0]!)
    expect(comparePositionKeys(head, keys[0]!)).toBeLessThan(0)

    const middle = generatePositionKey(keys[0]!, keys[1]!)
    expect(comparePositionKeys(keys[0]!, middle)).toBeLessThan(0)
    expect(comparePositionKeys(middle, keys[1]!)).toBeLessThan(0)

    const tail = generatePositionKey(keys[3]!, null)
    expect(comparePositionKeys(keys[3]!, tail)).toBeLessThan(0)
  })

  it('sortOrderToPositionKey avoids invalid decimal keys like a10', () => {
    expect(sortOrderToPositionKey(10)).toBe('aA')
    expect(() => generatePositionKey('a9', 'a10')).toThrow(/invalid order key/i)
    const between = generatePositionKey('a9', sortOrderToPositionKey(10))
    expect(between > 'a9' && between < 'aA').toBe(true)
  })
})
