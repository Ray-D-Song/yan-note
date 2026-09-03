import { spawnSync } from 'node:child_process'
import { checkMigrationPreconditions } from './lib/migration-preconditions.ts'

const remote = process.argv.includes('--remote')
const target = remote ? '--remote' : '--local'

function runQuery(sql: string): unknown[] {
  const result = spawnSync(
    'wrangler',
    ['d1', 'execute', 'DB', target, '--json', '--command', sql],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout)
    process.exit(result.status ?? 1)
  }

  const parsed = JSON.parse(result.stdout) as Array<{
    results?: unknown[]
  }>
  return parsed[0]?.results ?? []
}

const outcome = await checkMigrationPreconditions(runQuery)
if (!outcome.ok) {
  console.error(outcome.message)
  process.exit(1)
}

console.log(`Migration preconditions passed (${target}, schema=${outcome.schema}).`)
