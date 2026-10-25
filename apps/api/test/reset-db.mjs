// Resets the database named in DATABASE_URL to a fresh migrated and seeded state.
// Used by both e2e suites before a run; set E2E_SKIP_RESET=1 to keep the data.
//   node apps/api/test/reset-db.mjs
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
dotenv.config({ path: resolve(root, '.env'), quiet: true });

if (process.env.E2E_SKIP_RESET === '1') {
  console.log('[e2e] E2E_SKIP_RESET=1, keeping the current data');
  process.exit(0);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query('SELECT current_user AS u');
await client.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO "${rows[0].u}";`);
await client.end();
rmSync(resolve(root, 'apps/api/uploads'), { recursive: true, force: true });

console.log('[e2e] schema reset, migrating and seeding…');
execSync('pnpm db:migrate && pnpm db:seed', { cwd: root, stdio: process.env.E2E_VERBOSE ? 'inherit' : 'pipe' });
console.log('[e2e] database ready');
