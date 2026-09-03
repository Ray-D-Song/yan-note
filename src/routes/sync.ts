import { Hono } from 'hono'
import {
  applyMutations,
  getBootstrapSnapshot,
  getChangesSince,
  getMaxSeq,
  getMinAvailableSeq,
  getNoteVersion,
  listNoteVersions,
} from '../lib/sync-db'
import { MAX_MUTATIONS_PER_REQUEST, type Mutation } from '../lib/sync-types'
import { authMiddleware, type AuthVariables } from '../middleware/auth'

const sync = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()

sync.use('*', authMiddleware)

sync.get('/bootstrap', async (c) => {
  const userId = c.get('userId')
  const snapshot = await getBootstrapSnapshot(c.env.DB, userId)
  return c.json(snapshot)
})

sync.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{
    device_id?: string
    cursor?: number
    mutations?: Mutation[]
  }>()

  if (!body.device_id) {
    return c.json({ error: 'device_id is required' }, 400)
  }

  const cursor = body.cursor ?? 0
  const mutations = body.mutations ?? []

  if (mutations.length > MAX_MUTATIONS_PER_REQUEST) {
    return c.json({ error: `Maximum ${MAX_MUTATIONS_PER_REQUEST} mutations per request` }, 400)
  }

  const minSeq = await getMinAvailableSeq(c.env.DB, userId)
  if (cursor > 0 && cursor < minSeq) {
    return c.json({
      error: 'REBOOTSTRAP_REQUIRED',
      min_seq: minSeq,
      server_time: Date.now(),
    }, 409)
  }

  const { acks } = await applyMutations(c.env.DB, userId, mutations)
  const { changes, has_more } = await getChangesSince(c.env.DB, userId, cursor)
  const newCursor = changes.length > 0 ? changes[changes.length - 1]!.seq : cursor
  const maxSeq = await getMaxSeq(c.env.DB, userId)
  const effectiveCursor = Math.max(newCursor, maxSeq === cursor ? cursor : newCursor)

  return c.json({
    acks,
    changes,
    cursor: effectiveCursor,
    server_time: Date.now(),
    has_more,
  })
})

export default sync

const noteVersions = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>()

noteVersions.use('*', authMiddleware)

noteVersions.get('/:id/versions', async (c) => {
  const userId = c.get('userId')
  const noteId = c.req.param('id')
  const versions = await listNoteVersions(c.env.DB, userId, noteId)
  return c.json(versions)
})

  noteVersions.get('/:id/versions/:versionId', async (c) => {
  const userId = c.get('userId')
  const noteId = c.req.param('id')
  const versionId = c.req.param('versionId')
  const version = await getNoteVersion(c.env.DB, userId, noteId, versionId)
  if (!version) {
    return c.json({ error: 'Version not found' }, 404)
  }
  return c.json(version)
})

export { noteVersions }
