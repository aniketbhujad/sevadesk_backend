/**
 * Normalizes Indian and general mobile numbers.
 * For Indian numbers: extracts standard 10-digit format.
 * Strips spaces, hyphens, parentheses, and leading +91 / 0.
 */
export function normalizeMobile(mobile) {
  if (!mobile || typeof mobile !== 'string') return '';
  
  // Remove all non-digit characters
  const digits = mobile.replace(/\D/g, '');
  
  // If 12 digits starting with 91 (e.g. 919876543210)
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  
  // If 11 digits starting with 0 (e.g. 09876543210)
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  
  // If exactly 10 digits
  if (digits.length === 10) {
    return digits;
  }
  
  // Fallback to cleaned digits
  return digits;
}

/**
 * Validates whether the mobile number is a valid 10-digit Indian mobile number
 * (typically starts with 6, 7, 8, 9).
 */
export function isValidIndianMobile(mobile) {
  const normalized = normalizeMobile(mobile);
  return /^[6-9]\d{9}$/.test(normalized);
}

/**
 * Masks a mobile number for safe display/receipts if requested:
 * e.g. 9876543210 -> 98XXXXXX10
 */
export function maskMobile(mobile) {
  const norm = normalizeMobile(mobile);
  if (norm.length === 10) {
    return `${norm.slice(0, 2)}XXXXXX${norm.slice(8)}`;
  }
  return mobile ? `${mobile.slice(0, 3)}***${mobile.slice(-2)}` : '';
}
