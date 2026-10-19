import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

/** Reject placeholder secrets in production so we never boot insecure. */
function requireSecret(name, value) {
  if (!value || value.startsWith('change_me')) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${name} must be set to a strong random value in production.`);
    }
    if (!value) {
      console.warn(`[config] ${name} is not set - using a random dev-only secret.`);
      return crypto.randomBytes(48).toString('hex');
    }
    console.warn(`[config] ${name} still uses the placeholder value. Set it in .env.`);
    return value;
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  rootDir,

  db: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  },

  jwt: {
    accessSecret: requireSecret('JWT_ACCESS_SECRET', process.env.JWT_ACCESS_SECRET),
    refreshSecret: requireSecret('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS) || 7,
    issuer: 'taskpulse',
  },

  weather: {
    apiKey: (process.env.WEATHER_API_KEY || '').trim(),
    baseUrl: process.env.WEATHER_BASE_URL || 'https://api.openweathermap.org/data/2.5',
    units: process.env.WEATHER_UNITS || 'metric',
    lang: process.env.WEATHER_LANG || 'en',
    cacheTtlMs: Number(process.env.WEATHER_CACHE_TTL_MS) || 10 * 60 * 1000,
    timeoutMs: Number(process.env.WEATHER_TIMEOUT_MS) || 8000,
  },
};

env.isProd = env.nodeEnv === 'production';
env.isTest = env.nodeEnv === 'test';

if (!env.db.connectionString) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and fill it in.');
}

export default env;