import { types } from 'pg';

/**
 * Timestamps are stored as UTC in TIMESTAMP (no zone) columns. The driver reads such a value in
 * the Node process's own timezone, so a server running at +05:30 shows every time 5½ hours early.
 * Read them as UTC, whatever the server's clock is set to.
 */
types.setTypeParser(types.builtins.TIMESTAMP, (v: string) => new Date(`${v.replace(' ', 'T')}Z`));
