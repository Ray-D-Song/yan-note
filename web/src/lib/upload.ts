import { openAccountDb } from '@/lib/idb/database'
import { saveLocalAsset, markAssetUploaded, LocalAssetBudgetError } from '@/lib/asset-store'
import { getLastUserId } from '@/lib/sync/device-id'
import { scheduleSync } from '@/lib/sync/engine'
import { isQuotaExceededError } from '@/composables/useStorageQuota'
import type { LocalAsset } from '@/lib/sync/types'

async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function uploadImageFile(file: File): Promise<string> {
  const userId = getLastUserId()
  if (!userId) {
    throw new Error('未登录')
  }

  const assetId = `${userId}_${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const contentHash = await sha256Hex(file)
  const url = `/api/v1/uploads/${encodeURIComponent(assetId)}`

  const db = await openAccountDb(userId)
  const asset: LocalAsset = {
    id: assetId,
    blob: file,
    content_hash: contentHash,
    uploaded: false,
    created_at: Date.now(),
  }
  try {
    await saveLocalAsset(db, asset)
  } catch (err) {
    if (err instanceof LocalAssetBudgetError || isQuotaExceededError(err)) {
      throw new Error(
        err instanceof LocalAssetBudgetError
          ? err.message
          : '本地存储空间不足，无法保存图片。请释放空间后重试。',
      )
    }
    throw err
  }

  if (navigator.onLine) {
    void uploadAssetToCloud(userId, asset)
  }

  return url
}

async function uploadAssetToCloud(userId: string, asset: LocalAsset) {
  try {
    const response = await fetch(`/api/v1/uploads/${encodeURIComponent(asset.id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': asset.blob.type || 'application/octet-stream',
        'X-Content-Hash': asset.content_hash ?? '',
      },
      body: asset.blob,
    })
    if (!response.ok) {
      return
    }
    const db = await openAccountDb(userId)
    await markAssetUploaded(db, asset.id)
    scheduleSync(userId)
  } catch {
    // Will retry on next sync
  }
}

export async function getLocalAssetBlob(assetId: string): Promise<Blob | null> {
  const userId = getLastUserId()
  if (!userId) return null
  const db = await openAccountDb(userId)
  const asset = await db.get('assets', assetId)
  return asset?.blob ?? null
}
