import { z } from 'zod';
import { query, withTransaction } from '../db/connection.js';
import { queueAndSendReceiptSms } from '../services/sms/smsService.js';
import { logAudit } from '../services/auditService.js';

const paymentSchema = z.object({
  amount: z.preprocess(
    (v) => Number(v),
    z.number({ required_error: 'Payment amount is required' }).positive('Payment amount must be greater than 0')
  ),
  paymentMethod: z.preprocess(
    (v) => (v ? String(v) : 'Cash'),
    z.enum(['Cash', 'UPI', 'Card', 'NetBanking', 'Other']).default('Cash')
  ),
  transactionReference: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().trim().max(100).optional().nullable()
  ),
  notes: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().trim().max(500).optional().nullable()
  ),
  sendSms: z.preprocess(
    (v) => Boolean(v),
    z.boolean().default(false)
  ),
});

/**
 * Add a payment to an existing service record
 */
export async function addPayment(req, res, next) {
  try {
    const serviceRecordId = req.params.id;
    const data = paymentSchema.parse(req.body);

    const result = await withTransaction(async (conn) => {
      // 1. Lock and fetch service record
      const [records] = await conn.query(
        'SELECT id, total_charge, status, receipt_number FROM service_records WHERE id = ? AND archived_at IS NULL FOR UPDATE',
        [serviceRecordId]
      );

      if (!records.length) {
        throw new Error('Service record not found');
      }

      const record = records[0];
      const totalCharge = parseFloat(record.total_charge);

      // 2. Fetch existing recorded payments
      const [payments] = await conn.query(
        "SELECT COALESCE(SUM(amount), 0) as paid_sum FROM payments WHERE service_record_id = ? AND status = 'RECORDED'",
        [serviceRecordId]
      );

      const existingPaid = parseFloat(payments[0].paid_sum || 0);
      const remainingBalance = Math.max(0, totalCharge - existingPaid);

      if (remainingBalance <= 0) {
        throw new Error('This service is already fully paid.');
      }

      if (data.amount > remainingBalance) {
        throw new Error(`Payment of ₹${data.amount} exceeds remaining balance of ₹${remainingBalance.toFixed(2)}.`);
      }

      // 3. Insert payment
      const [payResult] = await conn.query(
        `INSERT INTO payments (
           service_record_id, amount, payment_method, transaction_reference,
           received_at, received_by, status, notes
         ) VALUES (?, ?, ?, ?, NOW(), ?, 'RECORDED', ?)`,
        [
          serviceRecordId,
          data.amount,
          data.paymentMethod,
          data.transactionReference || null,
          req.user?.id || null,
          data.notes || null,
        ]
      );

      const newPaymentId = payResult.insertId || payResult[0]?.id;
      const newTotalPaid = existingPaid + data.amount;
      const newBalance = Math.max(0, totalCharge - newTotalPaid);
      const newStatus = newBalance === 0 ? 'PAID' : 'PARTIALLY_PAID';

      // 4. Update service record status
      await conn.query('UPDATE service_records SET status = ?, updated_at = NOW() WHERE id = ?', [
        newStatus,
        serviceRecordId,
      ]);

      return {
        paymentId: newPaymentId,
        amount: data.amount,
        totalCharge,
        totalPaid: newTotalPaid,
        remainingBalance: newBalance,
        status: newStatus,
        receiptNumber: record.receipt_number,
      };
    });

    await logAudit({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'PAYMENT_ADDED',
      entityType: 'PAYMENT',
      entityId: String(result.paymentId),
      metadata: {
        serviceRecordId,
        amount: result.amount,
        newBalance: result.remainingBalance,
        status: result.status,
      },
      ipAddress: req.ip,
    });

    // Optional SMS receipt
    let smsResult = null;
    if (data.sendSms) {
      try {
        smsResult = await queueAndSendReceiptSms({
          serviceRecordId,
          paymentId: result.paymentId,
          userId: req.user?.id,
        });
      } catch (err) {
        console.warn('SMS dispatch error:', err.message);
        smsResult = { success: false, status: 'FAILED', error: err.message };
      }
    }

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        ...result,
        sms: smsResult,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get payment list for a service record
 */
export async function getPaymentsForRecord(req, res, next) {
  try {
    const serviceRecordId = req.params.id;

    const payments = await query(
      `SELECT p.*, u.username as received_by_username 
       FROM payments p
       LEFT JOIN users u ON p.received_by = u.id
       WHERE p.service_record_id = ?
       ORDER BY p.received_at DESC`,
      [serviceRecordId]
    );

    res.json({
      success: true,
      data: payments.map((p) => ({
        ...p,
        amount: parseFloat(p.amount),
      })),
    });
  } catch (err) {
    next(err);
  }
}
