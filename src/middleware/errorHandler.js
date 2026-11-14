import { config } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  // Safe console error log
  console.error('[API ERROR]', {
    method: req.method,
    url: req.originalUrl,
    message: err.message,
    ...(config.isProduction ? {} : { stack: err.stack }),
  });

  const statusCode = err.statusCode || (err.name === 'ZodError' ? 400 : 500);

  // Zod validation errors formatting
  if (err.name === 'ZodError') {
    const errorDetails = err.errors.map((e) => {
      const fieldPath = e.path.join('.');
      return fieldPath ? `${fieldPath}: ${e.message}` : e.message;
    });
    return res.status(400).json({
      success: false,
      message: 'Validation error: ' + errorDetails.join(', '),
      errors: err.errors,
    });
  }

  // Handle unique constraint violations from MySQL cleanly
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      message: 'A duplicate record already exists with the same unique value.',
    });
  }

  res.status(statusCode).json({
    success: false,
    message: config.isProduction && statusCode === 500
      ? 'An internal server error occurred. Please contact support.'
      : err.message,
  });
}
