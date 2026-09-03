export type SyncScheduleReason =
  | 'local_edit'
  | 'interval'
  | 'focus'
  | 'visibility'
  | 'online'
  | 'manual'

export const IDLE_PULL_MS = 60_000
export const MIN_SYNC_INTERVAL_MS = 5_000
export const SCHEDULE_DEBOUNCE_MS = 100

export type ShouldScheduleSyncInput = {
  reason: SyncScheduleReason
  now: number
  lastSyncAt: number
  lastAttemptAt: number
  hasPendingOutbox: boolean
  hasPendingAssets: boolean
  idlePullMs?: number
  minIntervalMs?: number
}

function hasPendingUpload(input: ShouldScheduleSyncInput): boolean {
  return input.hasPendingOutbox || input.hasPendingAssets
}

function withinMinInterval(input: ShouldScheduleSyncInput): boolean {
  const minIntervalMs = input.minIntervalMs ?? MIN_SYNC_INTERVAL_MS
  return input.lastAttemptAt > 0 && input.now - input.lastAttemptAt < minIntervalMs
}

export function shouldScheduleSync(input: ShouldScheduleSyncInput): boolean {
  const idlePullMs = input.idlePullMs ?? IDLE_PULL_MS
  const hasPending = hasPendingUpload(input)

  if (input.reason === 'local_edit' || input.reason === 'manual') {
    return hasPending
  }

  if (withinMinInterval(input)) {
    return false
  }

  if (hasPending) {
    return true
  }

  if (input.reason === 'interval') {
    return input.lastSyncAt === 0 || input.now - input.lastSyncAt >= idlePullMs
  }

  return true
}
