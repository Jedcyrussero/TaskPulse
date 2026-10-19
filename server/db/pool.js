import pg from 'pg';
import env from '../config/env.js';
import { readFile } from 'node:fs/promises';

const { Pool } = pg;

// Return DATE / TIMESTAMPTZ columns as ISO strings instead of JS Dates so the
// JSON the API returns is unambiguous regardless of the server timezone.
pg.types.setTypeParser(1114, (v) => new Date(`${v}Z`).toISOString());
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());
pg.types.setTypeParser(1082, (v) => v); // keep DATE as YYYY-MM-DD

export const pool = new Pool({
  connectionString: env.db.connectionString,
  ssl: env.db.ssl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Run a set of statements, each one in its own implicit transaction. */
export async function migrate() {
  const sqlPath = new URL('./schema.sql', import.meta.url);
  const sql = await readFile(sqlPath, 'utf8');

  await pool.query(sql);
  return sql;
}

export async function closePool() {
  await pool.end();
}