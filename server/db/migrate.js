import { migrate, closePool } from './pool.js';

const force = process.argv.includes('--force');

try {
  const client = await (await import('./pool.js')).pool.connect();
  try {
    if (force) {
      console.log('[migrate] --force: dropping app tables');
      await client.query(`
        DROP TABLE IF EXISTS refresh_tokens CASCADE;
        DROP TABLE IF EXISTS tasks CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
      `);
    }
    console.log('[migrate] applying schema...');
    await migrate();
    console.log('[migrate] done.');
  } finally {
    client.release();
  }
} catch (err) {
  console.error('[migrate] failed:', err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}