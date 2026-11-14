import { query, withTransaction } from '../../db/connection.js';
import { getSmsProvider } from './smsProvider.js';
import { generateIdempotencyKey } from '../../utils/idGenerator.js';
import { logAudit } from '../auditService.js';
import { config } from '../../config/env.js';

/**
 * Render SMS template with service record and payment variables
 */
export function formatReceiptMessage(template, data) {
  return template
    .replace('{CENTRE_NAME}', data.centreName || 'SevaDesk CSC')
    .replace('{RECEIPT_NO}', data.receiptNumber || '')
    .replace('{SERVICE_NAME}', data.serviceName || '')
    .replace('{TOTAL}', parseFloat(data.totalCharge || 0).toFixed(2))
    .replace('{PAID_TO_DATE}', parseFloat(data.paidToDate || 0).toFixed(2))
    .replace('{BALANCE}', parseFloat(data.balance || 0).toFixed(2));
}

/**
 * Queue and dispatch an SMS receipt for a service record transaction
 */
export async function queueAndSendReceiptSms({
  serviceRecordId,
  paymentId = null,
  recipientMobile,
  userId = null,
  customTemplate = null,
}) {
  // 1. Fetch latest service record & financial details
  const [record] = await query(
    `SELECT sr.id, sr.receipt_number, sr.service_name_snapshot, sr.total_charge,
            c.name as customer_name, c.mobile as customer_mobile,
            COALESCE(SUM(p.amount), 0) as paid_to_date
     FROM service_records sr
     JOIN customers c ON sr.customer_id = c.id
     LEFT JOIN payments p ON p.service_record_id = sr.id AND p.status = 'RECORDED'
     WHERE sr.id = ?
     GROUP BY sr.id, sr.receipt_number, sr.service_name_snapshot, sr.total_charge, c.name, c.mobile`,
    [serviceRecordId]
  );

  if (!record) {
    throw new Error(`Service record ${serviceRecordId} not found`);
  }

  const totalCharge = parseFloat(record.total_charge);
  const paidToDate = parseFloat(record.paid_to_date);
  const balance = Math.max(0, totalCharge - paidToDate);

  // 2. Fetch centre name from settings
  let centreName = config.centreDefaults.name;
  let template = customTemplate || config.sms.template;

  try {
    const settings = await query(
      `SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('centre_name', 'sms_template')`
    );
    settings.forEach((s) => {
      if (s.setting_key === 'centre_name') centreName = s.setting_value;
      if (!customTemplate && s.setting_key === 'sms_template') template = s.setting_value;
    });
  } catch (err) {
    console.warn('Failed to load settings for SMS template, using default:', err.message);
  }

  const messageBody = formatReceiptMessage(template, {
    centreName,
    receiptNumber: record.receipt_number,
    serviceName: record.service_name_snapshot,
    totalCharge,
    paidToDate,
    balance,
  });

  const idempotencyKey = generateIdempotencyKey(`SMS-SR${serviceRecordId}`);

  // 3. Insert notification outbox record (status: PENDING)
  const insertResult = await query(
    `INSERT INTO notifications (
       service_record_id, payment_id, recipient_mobile, message_body,
       channel, status, attempt_count, idempotency_key
     ) VALUES (?, ?, ?, ?, 'SMS', 'PENDING', 0, ?)`,
    [serviceRecordId, paymentId, recipientMobile || record.customer_mobile, messageBody, idempotencyKey]
  );

  const notificationId = insertResult.insertId;

  // 4. Send via provider
  return await dispatchNotification(notificationId, userId);
}

/**
 * Dispatch an existing notification (either initial send or retry)
 */
export async function dispatchNotification(notificationId, userId = null) {
  const [notification] = await query('SELECT * FROM notifications WHERE id = ?', [notificationId]);
  if (!notification) {
    throw new Error(`Notification ${notificationId} not found`);
  }

  // Prevent sending cancelled or already delivered
  if (['DELIVERED', 'CANCELLED'].includes(notification.status)) {
    return { success: false, message: `Notification is ${notification.status}` };
  }

  // Mark status: SENDING
  await query(
    `UPDATE notifications 
     SET status = 'SENDING', attempt_count = attempt_count + 1, last_attempt_at = NOW() 
     WHERE id = ?`,
    [notificationId]
  );

  const provider = getSmsProvider();
  let result;

  try {
    result = await provider.sendSms({
      destinationNumber: notification.recipient_mobile,
      message: notification.message_body,
      idempotencyKey: notification.idempotency_key,
    });
  } catch (err) {
    result = {
      success: false,
      errorCode: 'DISPATCH_ERROR',
      errorMessage: err.message,
      status: 'FAILED',
    };
  }

  if (result.success) {
    await query(
      `UPDATE notifications 
       SET status = 'SENT', provider_message_id = ?, sent_at = NOW(), last_error_code = NULL, last_error_message = NULL
       WHERE id = ?`,
      [result.messageId, notificationId]
    );

    await logAudit({
      userId,
      action: 'SMS_SENT',
      entityType: 'NOTIFICATION',
      entityId: String(notificationId),
      metadata: {
        serviceRecordId: notification.service_record_id,
        providerMessageId: result.messageId,
        provider: result.provider,
      },
    });

    return {
      success: true,
      notificationId,
      status: 'SENT',
      providerMessageId: result.messageId,
    };
  } else {
    await query(
      `UPDATE notifications 
       SET status = 'FAILED', last_error_code = ?, last_error_message = ?
       WHERE id = ?`,
      [result.errorCode || 'UNKNOWN_ERROR', (result.errorMessage || '').slice(0, 250), notificationId]
    );

    await logAudit({
      userId,
      action: 'SMS_FAILED',
      entityType: 'NOTIFICATION',
      entityId: String(notificationId),
      metadata: {
        serviceRecordId: notification.service_record_id,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      },
    });

    return {
      success: false,
      notificationId,
      status: 'FAILED',
      error: result.errorMessage,
    };
  }
}
