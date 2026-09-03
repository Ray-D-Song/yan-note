import { generateKeyBetween } from 'fractional-indexing'

/** Maximum sort_order covered by the position_key backfill migration. */
export const MAX_MIGRATION_SORT_ORDER = 999

/** Maximum sort_order repaired by overflow legacy-key migration 0014. */
export const MAX_OVERFLOW_SORT_ORDER = 1999

export function comparePositionKeys(a: string, b: string): number {
  if (a === b) {
    return 0
  }
  return a < b ? -1 : 1
}

export function generatePositionKey(before: string | null, after: string | null): string {
  const key = generateKeyBetween(before, after)
  if (before !== null && comparePositionKeys(before, key) >= 0) {
    throw new Error(`position key ${key} must be after ${before}`)
  }
  if (after !== null && comparePositionKeys(key, after) >= 0) {
    throw new Error(`position key ${key} must be before ${after}`)
  }
  return key
}

export function sortOrderToPositionKey(sortOrder: number): string {
  let prev: string | null = null
  let key = generateKeyBetween(null, null)
  for (let i = 0; i < sortOrder; i++) {
    prev = key
    key = generateKeyBetween(prev, null)
  }
  return key
}

export function positionKeyForIndex(
  siblings: Array<{ position_key: string }>,
  index: number,
): string {
  const before = index > 0 ? siblings[index - 1]!.position_key : null
  const after = index < siblings.length ? siblings[index]!.position_key : null
  return generatePositionKey(before, after)
}
