import { pool } from '../db/pool.js';
import ApiError from '../utils/ApiError.js';
import { hashPassword, createRefreshToken, hashToken } from '../utils/auth.js';

const PUBLIC_COLUMNS = 'id, email, display_name, city, country, created_at, updated_at';

export async function findUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, email, display_name, city, country, password_hash, created_at FROM users WHERE email = $1',
    [email],
  );
  return rows[0] || null;
}

export async function findUserById(id) {
  const { rows } = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function createUser({ email, password, displayName, city, country }) {
  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, display_name, city, country)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_COLUMNS}`,
    [email, passwordHash, displayName, city ?? null, country ?? null],
  );
  return rows[0];
}

export async function updateUser(id, { displayName, city, country }) {
  const { rows } = await pool.query(
    `UPDATE users
        SET display_name = COALESCE($2, display_name),
            city         = COALESCE($3, city),
            country      = COALESCE($4, country)
      WHERE id = $1
      RETURNING ${PUBLIC_COLUMNS}`,
    [id, displayName ?? null, city ?? null, country ?? null],
  );
  if (!rows[0]) throw ApiError.notFound('User not found');
  return rows[0];
}

/** Issue a refresh token, persisting only its hash. Revokes prior sessions. */
export async function issueRefreshToken(userId) {
  const { token, tokenHash, expiresAt } = createRefreshToken();
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt],
  );
  return { token, expiresAt };
}

/**
 * Consume a refresh token: revoke the presented one and issue a replacement
 * (rotation). Throws if unknown, already-used, or expired.
 */
export async function rotateRefreshToken(token) {
  const tokenHash = hashToken(token);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT rt.id, rt.user_id, rt.revoked_at, rt.expires_at, u.email, u.display_name
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1
        FOR UPDATE`,
      [tokenHash],
    );

    const record = rows[0];
    if (!record) throw ApiError.unauthorized('Invalid refresh token');
    if (record.revoked_at) throw ApiError.unauthorized('Refresh token already used');
    if (new Date(record.expires_at) <= new Date()) {
      throw ApiError.unauthorized('Refresh token expired');
    }

    await client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [record.id]);

    const next = createRefreshToken();
    await client.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [record.user_id, next.tokenHash, next.expiresAt],
    );

    await client.query('COMMIT');

    return {
      user: { id: record.user_id, email: record.email, display_name: record.display_name },
      token: next.token,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function revokeRefreshToken(token) {
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(token)],
  );
}

export async function revokeAllForUser(userId) {
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
}