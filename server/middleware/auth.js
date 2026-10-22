import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/auth.js';
import { query } from '../db/pool.js';

/** Require a valid `Authorization: Bearer <access token>` header. */
export default function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (!token || scheme.toLowerCase() !== 'bearer') {
    return next(ApiError.unauthorized('Missing bearer token'));
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.typ !== 'access') throw new Error('wrong token type');
    req.user = { id: Number(payload.sub), email: payload.email, displayName: payload.name };
    return next();
  } catch {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }
}

/**
 * Require the authenticated user to hold one of the given roles.
 *
 * The role is read from the database on every request rather than trusted from
 * the JWT, so a demotion takes effect immediately instead of lingering until
 * the access token expires. Missing/inactive users are treated as unauthorised,
 * and a signed-in user who simply lacks the role gets a 403.
 *
 *   router.get('/admin/users', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...roles) {
  const allowed = new Set(roles);

  return async function roleGuard(req, _res, next) {
    try {
      if (!req.user?.id) return next(ApiError.unauthorized('Not authenticated'));

      const { rows } = await query('SELECT role FROM users WHERE id = $1', [req.user.id]);
      if (!rows[0]) return next(ApiError.unauthorized('Account no longer exists'));

      const role = rows[0].role || 'user';
      req.user.role = role;

      if (!allowed.has(role)) {
        return next(ApiError.forbidden('You do not have permission to access this resource'));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/** Convenience alias for the common admin-only case. */
export const requireAdmin = requireRole('admin');
