import crypto from 'crypto';

/**
 * Generates a unique, collision-safe customer code
 * Format: CUST-YYYYMMDD-XXXX
 */
export function generateCustomerCode() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `CUST-${dateStr}-${rand}`;
}

/**
 * Generates a clean, professional receipt number
 * Format: SD-YYYY-XXXXXX
 */
export function generateReceiptNumber() {
  const year = new Date().getFullYear();
  const randNum = Math.floor(100000 + Math.random() * 900000);
  return `SD-${year}-${randNum}`;
}

/**
 * Generates an idempotency key for SMS / transactions
 */
export function generateIdempotencyKey(prefix = 'IDEMP') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}
