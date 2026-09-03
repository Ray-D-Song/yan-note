import { spawnSync } from 'node:child_process'

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

const violations = runQuery('PRAGMA foreign_key_check;') as Array<{
  table: string
  rowid: number
  parent: string
  fkid: number
}>

if (violations.length > 0) {
  console.error(`Foreign key check failed (${target}):`, violations)
  process.exit(1)
}

console.log(`Foreign key check passed (${target}).`)
