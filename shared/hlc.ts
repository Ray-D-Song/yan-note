export type HLC = {
  adjusted_ms: number
  counter: number
  device_id: string
}

export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000

export function compareHLC(a: HLC, b: HLC): number {
  if (a.adjusted_ms !== b.adjusted_ms) {
    return a.adjusted_ms - b.adjusted_ms
  }
  if (a.counter !== b.counter) {
    return a.counter - b.counter
  }
  return a.device_id.localeCompare(b.device_id)
}

export function hlcWins(incoming: HLC, existing: HLC | null): boolean {
  if (!existing) {
    return true
  }
  return compareHLC(incoming, existing) > 0
}

export function parseHLC(raw: string | null | undefined): HLC | null {
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as HLC
    if (
      typeof parsed.adjusted_ms === 'number' &&
      typeof parsed.counter === 'number' &&
      typeof parsed.device_id === 'string'
    ) {
      return parsed
    }
  } catch {
    // ignore malformed clock
  }
  return null
}

export function serializeHLC(hlc: HLC): string {
  return JSON.stringify(hlc)
}

export function createHLC(
  serverTimeMs: number,
  deviceId: string,
  lastHLC: HLC | null,
  counter = 0,
): HLC {
  const adjusted_ms = Math.max(serverTimeMs, lastHLC?.adjusted_ms ?? 0)
  let nextCounter = counter
  if (lastHLC && adjusted_ms === lastHLC.adjusted_ms) {
    nextCounter = Math.max(counter, lastHLC.counter + 1)
  }
  return { adjusted_ms, counter: nextCounter, device_id: deviceId }
}

export function isClockSkew(clock: HLC, serverTimeMs: number): boolean {
  return clock.adjusted_ms > serverTimeMs + CLOCK_SKEW_TOLERANCE_MS
}

export function rebaselineHLC(clock: HLC, serverTimeMs: number): HLC {
  return {
    adjusted_ms: serverTimeMs,
    counter: clock.counter,
    device_id: clock.device_id,
  }
}

export const CLOCK_FIELD_SUFFIXES = [
  'title_clock',
  'content_clock',
  'icon_clock',
  'parent_clock',
  'position_clock',
  'value_clock',
] as const

export function rebaselineMutationClocks(
  clock: HLC,
  changes: Record<string, unknown>,
  serverTimeMs: number,
): { clock: HLC; changes: Record<string, unknown> } {
  const nextClock = rebaselineHLC(clock, serverTimeMs)
  const nextChanges = { ...changes }
  for (const key of CLOCK_FIELD_SUFFIXES) {
    const raw = nextChanges[key]
    if (raw && typeof raw === 'object') {
      nextChanges[key] = rebaselineHLC(raw as HLC, serverTimeMs)
    }
  }
  return { clock: nextClock, changes: nextChanges }
}
