export const PERMANENT_REJECTION_REASONS = new Set([
  'Entity purged',
  'Note not found',
  'Database not found',
  'Cell not found',
  'Invalid parent',
  'Circular parent',
  'Cannot be own parent',
  'Unsupported database operation',
  'Unsupported row operation',
  'Unsupported entity type',
  'Invalid cell reference',
  'Invalid note reference',
  'Invalid database reference',
])

export function isPermanentRejection(reason: string | undefined): boolean {
  if (!reason) {
    return false
  }
  if (reason.startsWith('Unsupported')) {
    return true
  }
  return PERMANENT_REJECTION_REASONS.has(reason)
}

export function isRetryableRejection(reason: string | undefined): boolean {
  if (!reason) {
    return true
  }
  if (reason === 'CLOCK_SKEW') {
    return true
  }
  return !isPermanentRejection(reason)
}
