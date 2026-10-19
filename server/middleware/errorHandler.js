import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity.
/** pg wraps socket failures in an AggregateError, so dig out the real code. */
function dbErrorCode(err) {
  if (err.code) return err.code;
  const inner = err.errors?.find((e) => e.code);
  if (inner) return inner.code;
  const match = /(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ECONNRESET)/.exec(err.message || '');
  return match ? match[1] : null;
}

export function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  const dbCode = dbErrorCode(err);

  // Translate the common Postgres driver errors into clean API responses.
  if (dbCode === '23505') {
    status = 409;
    message = 'That value is already taken.';
    details = [{ field: err.constraint, message: 'duplicate value' }];
  } else if (dbCode === '23503') {
    status = 400;
    message = 'Referenced record does not exist.';
  } else if (dbCode === '22P02') {
    status = 400;
    message = 'Malformed identifier.';
  } else if (
    ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'ECONNRESET', '57P03', '53300'].includes(dbCode)
  ) {
    // The database is down or unreachable - that is an availability problem,
    // not a bug in the request.
    status = 503;
    message = 'Database is unavailable. Check that Postgres is running and DATABASE_URL is correct.';
    console.error('[db] connection failure:', dbCode);
  }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    if (env.isProd) message = 'Internal server error';
  }

  res.status(status).json({
    error: {
      message,
      ...(details ? { details } : {}),
      ...(env.isProd ? {} : { stack: err.stack }),
    },
  });
}