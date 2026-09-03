import { MAX_OVERFLOW_SORT_ORDER } from '../../shared/position-key.ts'

export type QueryRunner = (sql: string) => Promise<unknown[]> | unknown[]

export type MigrationPreconditionResult =
  | { ok: true; schema: 'missing' | 'pre_position_key' | 'with_position_key' }
  | { ok: false; schema: 'pre_position_key' | 'with_position_key'; message: string }

export async function checkMigrationPreconditions(
  runQuery: QueryRunner,
  maxOverflow = MAX_OVERFLOW_SORT_ORDER,
): Promise<MigrationPreconditionResult> {
  const notesTable = (await runQuery(
    `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'notes'`,
  )) as Array<{ count: number }>

  if ((notesTable[0]?.count ?? 0) === 0) {
    return { ok: true, schema: 'missing' }
  }

  const columns = (await runQuery(`PRAGMA table_info(notes)`)) as Array<{ name: string }>
  const hasPositionKey = columns.some((column) => column.name === 'position_key')

  if (!hasPositionKey) {
    const overflow = (await runQuery(
      `SELECT COUNT(*) AS count FROM notes WHERE sort_order > ${maxOverflow}`,
    )) as Array<{ count: number }>

    if ((overflow[0]?.count ?? 0) > 0) {
      return {
        ok: false,
        schema: 'pre_position_key',
        message:
          `Migration precondition failed: ${overflow[0]?.count} note(s) have sort_order > ${maxOverflow} ` +
          'before position_key exists. Rebalance manually before deploy.',
      }
    }

    return { ok: true, schema: 'pre_position_key' }
  }

  const overflow = (await runQuery(
    `SELECT COUNT(*) AS count FROM notes
     WHERE sort_order > ${maxOverflow}
       AND position_key = 'a' || sort_order`,
  )) as Array<{ count: number }>

  if ((overflow[0]?.count ?? 0) > 0) {
    return {
      ok: false,
      schema: 'with_position_key',
      message:
        `Migration precondition failed: ${overflow[0]?.count} note(s) have legacy position_key ` +
        `with sort_order > ${maxOverflow}. Rebalance manually before deploy.`,
    }
  }

  return { ok: true, schema: 'with_position_key' }
}
