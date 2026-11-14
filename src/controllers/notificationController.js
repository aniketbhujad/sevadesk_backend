import { query } from '../db/connection.js';
import { dispatchNotification, queueAndSendReceiptSms } from '../services/sms/smsService.js';
import { logAudit } from '../services/auditService.js';
import { maskMobile } from '../utils/phone.js';

/**
 * List SMS notifications with status filtering
 */
export async function getNotifications(req, res, next) {
  try {
    const status = (req.query.status || '').trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    let whereSql = '';
    const params = [];

    if (status) {
      whereSql = 'WHERE n.status = ?';
      params.push(status);
    }

    const [countRow] = await query(
      `SELECT COUNT(*) as total FROM notifications n ${whereSql}`,
      params
    );
    const totalRecords = Number(countRow.total || 0);

    const rows = await query(
      `SELECT 
         n.id, n.service_record_id, n.payment_id, n.recipient_mobile,
         n.message_body, n.channel, n.status, n.provider_message_id,
         n.attempt_count, n.last_error_code, n.last_error_message,
         n.last_attempt_at, n.sent_at, n.delivered_at, n.idempotency_key,
         n.created_at,
         sr.receipt_number, sr.service_name_snapshot,
         c.name as customer_name
       FROM notifications n
       LEFT JOIN service_records sr ON n.service_record_id = sr.id
       LEFT JOIN customers c ON sr.customer_id = c.id
       ${whereSql}
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        // Safely mask mobile for list views
        masked_mobile: maskMobile(r.recipient_mobile),
      })),
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retry an existing failed notification
 */
export async function retryNotification(req, res, next) {
  try {
    const notificationId = req.params.id;

    const [notif] = await query('SELECT * FROM notifications WHERE id = ?', [notificationId]);
    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    if (notif.attempt_count >= 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum retry limit (5 attempts) reached for this notification.',
      });
    }

    const result = await dispatchNotification(notificationId, req.user?.id);

    await logAudit({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'SMS_RETRY',
      entityType: 'NOTIFICATION',
      entityId: String(notificationId),
      metadata: { status: result.status, attemptCount: notif.attempt_count + 1 },
      ipAddress: req.ip,
    });

    res.json({
      success: result.success,
      message: result.success ? 'SMS resent successfully' : 'SMS retry failed: ' + result.error,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Manual resend receipt SMS for a service record
 */
export async function resendReceiptSms(req, res, next) {
  try {
    const serviceRecordId = req.params.id;

    const [record] = await query('SELECT id FROM service_records WHERE id = ?', [serviceRecordId]);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Service record not found' });
    }

    const result = await queueAndSendReceiptSms({
      serviceRecordId,
      userId: req.user?.id,
    });

    res.json({
      success: result.success,
      message: result.success ? 'SMS receipt dispatched successfully' : 'SMS receipt dispatch failed',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
