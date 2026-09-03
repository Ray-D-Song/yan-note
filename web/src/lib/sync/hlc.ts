import type { HLC } from './types'

export {
  compareHLC,
  hlcWins,
  rebaselineHLC,
  rebaselineMutationClocks,
  CLOCK_SKEW_TOLERANCE_MS,
} from '../../../../shared/hlc'

export function createClientHLC(
  serverTimeMs: number,
  serverOffset: number,
  deviceId: string,
  lastHLC: HLC | null,
): HLC {
  const localMs = Date.now() + serverOffset
  const adjusted_ms = Math.max(localMs, serverTimeMs, lastHLC?.adjusted_ms ?? 0)
  let counter = 0
  if (lastHLC && adjusted_ms === lastHLC.adjusted_ms) {
    counter = lastHLC.counter + 1
  }
  return { adjusted_ms, counter, device_id: deviceId }
}

export function rebaselineClock(clock: HLC, serverTimeMs: number): HLC {
  return { adjusted_ms: serverTimeMs, counter: clock.counter, device_id: clock.device_id }
}

export function isClockSkew(clock: HLC, serverTimeMs: number): boolean {
  return clock.adjusted_ms > serverTimeMs + 5 * 60 * 1000
}

export class ClientClock {
  private serverOffset = 0
  private lastHLC: HLC | null = null

  constructor(private deviceId: string) {}

  updateServerTime(serverTimeMs: number) {
    this.serverOffset = serverTimeMs - Date.now()
  }

  get offset() {
    return this.serverOffset
  }

  now(): HLC {
    const serverTime = Date.now() + this.serverOffset
    const hlc = createClientHLC(serverTime, this.serverOffset, this.deviceId, this.lastHLC)
    this.lastHLC = hlc
    return hlc
  }

  rebaseline(serverTimeMs: number) {
    this.serverOffset = serverTimeMs - Date.now()
    if (this.lastHLC) {
      this.lastHLC = rebaselineClock(this.lastHLC, serverTimeMs)
    }
  }
}
