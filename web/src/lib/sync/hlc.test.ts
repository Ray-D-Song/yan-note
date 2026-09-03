import { describe, expect, it } from 'vitest'
import { ClientClock, compareHLC, createClientHLC, isClockSkew, rebaselineClock } from '@/lib/sync/hlc'
import type { HLC } from '@/lib/sync/types'

describe('HLC', () => {
  it('maintains monotonicity on same device', () => {
    const clock = new ClientClock('device-a')
    clock.updateServerTime(Date.now())
    const a = clock.now()
    const b = clock.now()
    expect(compareHLC(b, a)).toBeGreaterThan(0)
  })

  it('compares by adjusted_ms then counter then device_id', () => {
    const a: HLC = { adjusted_ms: 100, counter: 0, device_id: 'a' }
    const b: HLC = { adjusted_ms: 200, counter: 0, device_id: 'b' }
    const c: HLC = { adjusted_ms: 100, counter: 1, device_id: 'a' }
    expect(compareHLC(a, b)).toBeLessThan(0)
    expect(compareHLC(c, a)).toBeGreaterThan(0)
  })

  it('rebaselines clock on server time correction', () => {
    const original: HLC = { adjusted_ms: 999999999, counter: 5, device_id: 'dev' }
    const rebased = rebaselineClock(original, 1000)
    expect(rebased.adjusted_ms).toBe(1000)
    expect(rebased.counter).toBe(5)
  })

  it('detects clock skew beyond tolerance', () => {
    const future: HLC = { adjusted_ms: Date.now() + 10 * 60 * 1000, counter: 0, device_id: 'dev' }
    expect(isClockSkew(future, Date.now())).toBe(true)
  })

  it('createClientHLC advances counter on same millisecond', () => {
    const serverTime = 5000
    const first = createClientHLC(serverTime, 0, 'dev', null)
    const second = createClientHLC(serverTime, 0, 'dev', first)
    expect(second.adjusted_ms).toBeGreaterThanOrEqual(first.adjusted_ms)
    if (second.adjusted_ms === first.adjusted_ms) {
      expect(second.counter).toBeGreaterThan(first.counter)
    }
  })
})
