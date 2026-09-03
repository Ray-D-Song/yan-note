import { env } from 'cloudflare:test'
import { beforeAll } from 'vitest'
import migrations from '../test/d1-migrations.json'

beforeAll(async () => {
  for (const migration of migrations) {
    for (const query of migration.queries) {
      await env.DB.prepare(query).run()
    }
  }
})
