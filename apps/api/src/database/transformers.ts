import type { ValueTransformer } from 'typeorm';

/** Postgres NUMERIC comes back as a string; read it as a JS number. */
export const numeric: ValueTransformer = {
  to: (v: number | null | undefined) => v,
  from: (v: string | null) => (v === null || v === undefined ? null : Number(v)),
};
