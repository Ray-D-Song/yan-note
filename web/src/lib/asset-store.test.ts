import { describe, expect, it } from 'vitest'
import {
  assertAssetBudget,
  LocalAssetBudgetError,
  MAX_LOCAL_ASSETS,
  MAX_PENDING_ASSET_BYTES,
  selectUploadedAssetsForEviction,
  UPLOADED_ASSET_TTL_MS,
} from '@/lib/asset-store'
import type { LocalAsset } from '@/lib/sync/types'

function asset(
  id: string,
  overrides: Partial<LocalAsset> & Pick<LocalAsset, 'blob'>,
): LocalAsset {
  return {
    id,
    content_hash: null,
    uploaded: false,
    created_at: 1,
    ...overrides,
  }
}

describe('asset-store budget', () => {
  it('never selects pending assets for eviction', () => {
    const now = 10_000
    const pending = Array.from({ length: MAX_LOCAL_ASSETS + 5 }, (_, i) =>
      asset(`pending-${i}`, { blob: new Blob(['x']), uploaded: false, created_at: i }),
    )
    const evicted = selectUploadedAssetsForEviction(pending, now)
    expect(evicted.size).toBe(0)
  })

  it('evicts uploaded assets past TTL before count cap', () => {
    const now = UPLOADED_ASSET_TTL_MS + 100
    const assets = [
      asset('old-uploaded', {
        blob: new Blob(['a']),
        uploaded: true,
        uploaded_at: 0,
        created_at: 0,
      }),
      asset('fresh-pending', { blob: new Blob(['b']), uploaded: false, created_at: 1 }),
    ]
    expect(selectUploadedAssetsForEviction(assets, now)).toEqual(new Set(['old-uploaded']))
  })

  it('rejects new pending asset when count cap is reached', () => {
    const existing = Array.from({ length: MAX_LOCAL_ASSETS }, (_, i) =>
      asset(`a-${i}`, { blob: new Blob(['x']), uploaded: false, created_at: i }),
    )
    expect(() =>
      assertAssetBudget(existing, asset('new', { blob: new Blob(['y']), uploaded: false })),
    ).toThrow(LocalAssetBudgetError)
  })

  it('allows new asset after evicting expired uploaded records at count cap', () => {
    const now = UPLOADED_ASSET_TTL_MS + 100
    const existing = Array.from({ length: MAX_LOCAL_ASSETS }, (_, i) =>
      asset(`a-${i}`, {
        blob: new Blob(['x']),
        uploaded: i === 0,
        uploaded_at: i === 0 ? 0 : undefined,
        created_at: i,
      }),
    )
    const evictable = selectUploadedAssetsForEviction(existing, now)
    expect(evictable.size).toBe(1)
    const afterEvict = existing.filter((a) => !evictable.has(a.id))
    expect(() =>
      assertAssetBudget(afterEvict, asset('new', { blob: new Blob(['y']), uploaded: false })),
    ).not.toThrow()
  })
})
