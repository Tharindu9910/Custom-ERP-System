import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [],
  synchronize: false,
});

async function clear() {
  await ds.initialize();
  console.log('✅ Connected to database\n');

  // Fetch every table in the public schema except the TypeORM migrations
  // tracking table. pg-boss lives in its own schema so it is already excluded.
  const rows = await ds.query<{ tablename: string }[]>(`
    SELECT tablename
    FROM   pg_tables
    WHERE  schemaname = 'public'
    AND    tablename  != 'migrations'
    ORDER  BY tablename
  `);

  if (rows.length === 0) {
    console.log('No tables found — run migrations first.');
    await ds.destroy();
    return;
  }

  console.log(`Truncating ${rows.length} tables:`);
  rows.forEach((r) => console.log(`  - ${r.tablename}`));
  console.log('');

  // Single statement — CASCADE handles FK ordering, RESTART IDENTITY resets
  // any serial sequences (no-op for UUID PKs but harmless).
  const tableList = rows.map((r) => `"${r.tablename}"`).join(', ');
  await ds.query(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`);

  console.log('✅ All data cleared. Schema is intact.\n');
  console.log('Tip: run  pnpm db:seed  to restore dev fixtures.');

  await ds.destroy();
}

clear().catch((e) => {
  console.error(e);
  process.exit(1);
});