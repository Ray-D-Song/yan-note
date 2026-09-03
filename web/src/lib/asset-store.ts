import type { IDBPDatabase } from 'idb'
import type { LocalAsset } from '@/lib/sync/types'
import type { YanNoteDB } from '@/lib/idb/database'

/** Maximum number of asset records kept locally (including pending uploads). */
export const MAX_LOCAL_ASSETS = 80

/** Uploaded blobs can be removed locally after this age — server holds the canonical copy. */
export const UPLOADED_ASSET_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Rough byte budget for pending upload blobs retained offline. */
export const MAX_PENDING_ASSET_BYTES = 32 * 1024 * 1024

export class LocalAssetBudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocalAssetBudgetError'
  }
}

function assetBlobSize(asset: LocalAsset): number {
  return asset.blob?.size ?? 0
}

export function selectUploadedAssetsForEviction(
  assets: LocalAsset[],
  now: number,
): Set<string> {
  const toDelete = new Set<string>()

  for (const asset of assets) {
    if (asset.uploaded && now - (asset.uploaded_at ?? asset.created_at) > UPLOADED_ASSET_TTL_MS) {
      toDelete.add(asset.id)
    }
  }

  let remaining = assets.filter((a) => !toDelete.has(a.id))

  while (remaining.length > MAX_LOCAL_ASSETS) {
    const uploaded = remaining
      .filter((a) => a.uploaded)
      .sort((a, b) => (a.uploaded_at ?? a.created_at) - (b.uploaded_at ?? b.created_at))
    const victim = uploaded[0]
    if (!victim) break
    toDelete.add(victim.id)
    remaining = remaining.filter((a) => a.id !== victim.id)
  }

  return toDelete
}

export function assertAssetBudget(assets: LocalAsset[], incoming: LocalAsset): void {
  const pending = assets.filter((a) => !a.uploaded)
  const pendingBytes = pending.reduce((sum, a) => sum + assetBlobSize(a), 0)

  if (assets.length >= MAX_LOCAL_ASSETS) {
    throw new LocalAssetBudgetError(
      `本地附件数量已达上限（${MAX_LOCAL_ASSETS} 个）。请先删除笔记中的图片或等待已上传附件过期后再试。`,
    )
  }

  if (pendingBytes + assetBlobSize(incoming) > MAX_PENDING_ASSET_BYTES) {
    throw new LocalAssetBudgetError(
      `离线待上传附件已超过 ${Math.round(MAX_PENDING_ASSET_BYTES / (1024 * 1024))} MiB 限额。请等待网络恢复并同步后再插入新图片。`,
    )
  }
}

export async function deleteLocalAsset(
  db: IDBPDatabase<YanNoteDB>,
  assetId: string,
): Promise<void> {
  await db.delete('assets', assetId)
}

export async function markAssetUploaded(
  db: IDBPDatabase<YanNoteDB>,
  assetId: string,
): Promise<void> {
  const asset = await db.get('assets', assetId)
  if (!asset) return
  await db.put('assets', {
    ...asset,
    uploaded: true,
    uploaded_at: Date.now(),
  })
  await evictLocalAssets(db)
}

/** @deprecated Use markAssetUploaded */
export const markAssetUploadedAndEvict = markAssetUploaded

export async function evictLocalAssets(db: IDBPDatabase<YanNoteDB>): Promise<void> {
  const all = await db.getAll('assets')
  if (all.length === 0) return

  const toDelete = selectUploadedAssetsForEviction(all, Date.now())
  if (toDelete.size === 0) return

  const tx = db.transaction('assets', 'readwrite')
  for (const id of toDelete) {
    await tx.store.delete(id)
  }
  await tx.done
}

export async function saveLocalAsset(
  db: IDBPDatabase<YanNoteDB>,
  asset: LocalAsset,
): Promise<void> {
  await evictLocalAssets(db)
  const existing = await db.getAll('assets')
  assertAssetBudget(existing, asset)
  await db.put('assets', asset)
}
