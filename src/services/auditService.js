import { query } from '../db/connection.js';

/**
 * Strips sensitive keys like passwords, secrets, pin, tokens
 */
function sanitizeMetadata(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const sensitiveKeys = ['password', 'password_hash', 'token', 'secret', 'key', 'pin', 'card'];
  const sanitized = Array.isArray(obj) ? [] : {};

  for (const [k, v] of Object.entries(obj)) {
    if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
      sanitized[k] = '[REDACTED]';
    } else if (v && typeof v === 'object') {
      sanitized[k] = sanitizeMetadata(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Log an audit entry
 */
export async function logAudit({
  userId = null,
  username = null,
  action,
  entityType,
  entityId,
  metadata = null,
  ipAddress = null,
}) {
  try {
    const cleanMeta = metadata ? JSON.stringify(sanitizeMetadata(metadata)) : null;

    await query(
      `INSERT INTO audit_logs (user_id, username_snapshot, action, entity_type, entity_id, metadata_json, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, username, action, entityType, String(entityId), cleanMeta, ipAddress]
    );
  } catch (err) {
    // Audit failure should not crash main request, but should be logged to stderr
    console.error('[AUDIT LOG ERROR] Failed to record audit log:', err.message);
  }
}
