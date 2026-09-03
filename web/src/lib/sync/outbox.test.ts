import { describe, expect, it } from 'vitest'
import { compareHLC, createClientHLC } from './hlc'

describe('outbox clock monotonicity for retries', () => {
  it('generates increasing clocks for sequential mutations', () => {
    const serverTime = 10000
    let last = createClientHLC(serverTime, 0, 'device-a', null)
    for (let i = 0; i < 5; i++) {
      const next = createClientHLC(serverTime, 0, 'device-a', last)
      expect(compareHLC(next, last)).toBeGreaterThan(0)
      last = next
    }
  })
})
