import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5180);
export const API = `http://localhost:${API_PORT}`;

/** DATABASE_URL from the environment or the repo's root .env. */
export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(resolve(__dirname, '../../../.env'), 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL not set');
  return line.slice('DATABASE_URL='.length).trim();
}
