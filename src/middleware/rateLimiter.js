import rateLimit from 'express-rate-limit';

/**
 * Strict limiter for login endpoint to prevent brute-force attacks
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * SMS dispatch and retry rate limiter to prevent abuse and costs
 */
export const smsLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30, // 30 SMS dispatches / retries per window
  message: {
    success: false,
    message: 'SMS request limit reached. Please wait before triggering more notifications.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API limiter for sensitive data creation
 */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 operations per minute
  standardHeaders: true,
  legacyHeaders: false,
});
