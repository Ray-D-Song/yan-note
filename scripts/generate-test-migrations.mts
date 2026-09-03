import { readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

spawnSync('node', ['--experimental-strip-types', 'scripts/generate-position-key-migration.mts'], {
  stdio: 'inherit',
})

const migrations = await readD1Migrations('./migrations')
writeFileSync('./test/d1-migrations.json', JSON.stringify(migrations, null, 2))
console.log(`Generated ${migrations.length} migrations for tests`)
