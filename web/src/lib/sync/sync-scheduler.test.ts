import { describe, expect, it } from 'vitest'
import {
  IDLE_PULL_MS,
  MIN_SYNC_INTERVAL_MS,
  shouldScheduleSync,
} from '@/lib/sync/sync-scheduler'

const base = {
  now: 100_000,
  lastSyncAt: 50_000,
  lastAttemptAt: 0,
  hasPendingOutbox: false,
  hasPendingAssets: false,
  idlePullMs: IDLE_PULL_MS,
  minIntervalMs: MIN_SYNC_INTERVAL_MS,
}

describe('shouldScheduleSync', () => {
  it('skips interval pull when idle and last sync was recent', () => {
    expect(
      shouldScheduleSync({
        ...base,
        reason: 'interval',
        now: base.lastSyncAt + IDLE_PULL_MS - 1,
      }),
    ).toBe(false)
  })

  it('allows interval pull when idle and last sync is older than idlePullMs', () => {
    expect(
      shouldScheduleSync({
        ...base,
        reason: 'interval',
        now: base.lastSyncAt + IDLE_PULL_MS,
      }),
    ).toBe(true)
  })

  it('allows interval pull when outbox has pending mutations', () => {
    expect(
      shouldScheduleSync({
        ...base,
        reason: 'interval',
        now: base.lastSyncAt + 1,
        hasPendingOutbox: true,
      }),
    ).toBe(true)
  })

  it('blocks focus within minInterval after last attempt', () => {
    expect(
      shouldScheduleSync({
        ...base,
        reason: 'focus',
        lastAttemptAt: base.now - MIN_SYNC_INTERVAL_MS + 1,
      }),
    ).toBe(false)
  })

  it('allows focus after minInterval elapsed', () => {
    expect(
      shouldScheduleSync({
        ...base,
        reason: 'focus',
        lastAttemptAt: base.now - MIN_SYNC_INTERVAL_MS,
      }),
    ).toBe(true)
  })

  it('allows local_edit when outbox has pending mutations', () => {
    expect(
      shouldScheduleSync({
        ...base,
        reason: 'local_edit',
        hasPendingOutbox: true,
      }),
    ).toBe(true)
  })

  it('skips local_edit when nothing is pending', () => {
    expect(
      shouldScheduleSync({
        ...base,
        reason: 'local_edit',
      }),
    ).toBe(false)
  })

  it('allows manual sync only when uploads are pending', () => {
    expect(
      shouldScheduleSync({
        ...base,
        reason: 'manual',
        hasPendingAssets: true,
      }),
    ).toBe(true)

    expect(
      shouldScheduleSync({
        ...base,
        reason: 'manual',
      }),
    ).toBe(false)
  })
})
