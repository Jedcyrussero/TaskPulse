import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

const SALT_ROUNDS = 12;

export function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, name: user.display_name, typ: 'access' },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessTtl, issuer: env.jwt.issuer },
  );
}

/** Opaque refresh token. We store only its SHA-256 digest in the database. */
export function createRefreshToken() {
  const token = crypto.randomBytes(48).toString('hex');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + env.jwt.refreshTtlDays * 86_400_000),
  };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret, { issuer: env.jwt.issuer });
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: env.jwt.refreshTtlDays * 86_400_000,
  };
}

export const REFRESH_COOKIE = 'tp_refresh';