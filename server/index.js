import env from './config/env.js';
import { createApp } from './app.js';
import { pool } from './db/pool.js';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`\n  TaskPulse API listening on http://localhost:${env.port}`);
  console.log(`  Environment : ${env.nodeEnv}`);
  console.log(`  Frontend    : http://localhost:${env.port}`);
  console.log(`  Weather     : ${env.weather.apiKey ? 'OpenWeatherMap configured' : 'no API key (widget will show unavailable)'}\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${env.port} is already in use. Set a different PORT in .env.\n`);
  } else {
    console.error('\n  Server failed to start:', err.message, '\n');
  }
  process.exit(1);
});

async function shutdown(signal) {
  console.log(`\n[server] ${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end();
    console.log('[server] closed cleanly.');
    process.exit(0);
  });
  // Don't hang forever on lingering keep-alive sockets.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  console.error('[server] unhandled rejection:', err);
});