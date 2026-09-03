/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  }),
)

const SYNC_TAG_PREFIX = 'yan-note-sync-'

function openAssetDb(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`yan-note-${userId}`, 2)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function getAssetBlob(assetId: string): Promise<Blob | null> {
  const userId = assetId.split('_')[0]
  if (!userId) return null
  try {
    const db = await openAssetDb(userId)
    return new Promise((resolve, reject) => {
      const tx = db.transaction('assets', 'readonly')
      const req = tx.objectStore('assets').get(assetId)
      req.onsuccess = () => resolve(req.result?.blob ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'GET' && url.pathname.startsWith('/api/v1/uploads/')) {
    event.respondWith(handleUploadGet(event.request))
  }
})

async function handleUploadGet(request: Request): Promise<Response> {
  try {
    const network = await fetch(request)
    if (network.ok) return network
  } catch {
    // fall through to local
  }

  const assetId = decodeURIComponent(new URL(request.url).pathname.replace('/api/v1/uploads/', ''))
  const blob = await getAssetBlob(assetId)
  if (!blob) {
    return new Response('Not found', { status: 404 })
  }
  return new Response(blob, {
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  })
}

self.addEventListener('sync', (event) => {
  const tag = (event as SyncEvent).tag
  if (tag.startsWith(SYNC_TAG_PREFIX)) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'background-sync', tag })
        }
      }),
    )
  }
})
