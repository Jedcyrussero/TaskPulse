import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/auth.js';

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