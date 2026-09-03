import { createHLC } from '../../shared/hlc'
import { applyMutations } from './sync-db'
import type { EntityType, Mutation, MutationAck, MutationKind } from './sync-types'
import { now } from './db'

const LEGACY_DEVICE_ID = 'legacy-api'

export function buildLegacyMutation(
  entityType: EntityType,
  entityId: string,
  kind: MutationKind,
  changes: Record<string, unknown>,
  baseRevision = 0,
): Mutation {
  const serverTime = now()
  const clock = createHLC(serverTime, LEGACY_DEVICE_ID, null)
  return {
    mutation_id: crypto.randomUUID(),
    device_id: LEGACY_DEVICE_ID,
    entity_type: entityType,
    entity_id: entityId,
    kind,
    base_revision: baseRevision,
    clock,
    changes,
  }
}

export async function applyLegacyMutation(
  db: D1Database,
  userId: string,
  mutation: Mutation,
): Promise<MutationAck> {
  const { acks } = await applyMutations(db, userId, [mutation])
  return acks[0] ?? { mutation_id: mutation.mutation_id, result: 'rejected', reason: 'No ack' }
}
