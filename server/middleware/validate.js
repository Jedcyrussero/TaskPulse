import ApiError from '../utils/ApiError.js';

/**
 * Validate `req[source]` against a Zod schema, replacing it with the parsed
 * result so controllers receive coerced, trusted values.
 */
export default function validate(schema, source = 'body') {
  return function validateMiddleware(req, _res, next) {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || source,
        message: issue.message,
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }

    req[source] = result.data;
    return next();
  };
}