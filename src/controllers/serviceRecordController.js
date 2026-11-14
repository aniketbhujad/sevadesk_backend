import { z } from 'zod';
import { query, withTransaction } from '../db/connection.js';
import { generateReceiptNumber, generateCustomerCode } from '../utils/idGenerator.js';
import { normalizeMobile, isValidIndianMobile } from '../utils/phone.js';
import { queueAndSendReceiptSms } from '../services/sms/smsService.js';
import { logAudit } from '../services/auditService.js';
import { config } from '../config/env.js';

const createServiceRecordSchema = z.object({
  customerId: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int().positive('Customer ID must be a valid positive number').nullable().optional()
  ),
  customerName: z.string({ required_error: 'Customer name is required' }).trim().min(2, 'Customer name must be at least 2 characters').optional().or(z.literal('')),
  customerMobile: z.string().trim().optional().or(z.literal('')),
  serviceId: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int().positive().nullable().optional()
  ),
  serviceName: z.string({ required_error: 'Service name is required' }).trim().min(1, 'Service name is required'),
  totalCharge: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
    z.number({ required_error: 'Total charge is required' }).min(0, 'Total charge cannot be negative')
  ),
  amountPaid: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
    z.number({ required_error: 'Amount paid is required' }).min(0, 'Amount paid cannot be negative')
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
    z.string().trim().max(1000).optional().nullable()
  ),
  sendSms: z.preprocess(
    (v) => Boolean(v),
    z.boolean().default(false)
  ),
});

/**
 * List / Filter service records
 */
export async function getServiceRecords(req, res, next) {
  try {
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();
    const service = (req.query.service || '').trim();
    const fromDate = (req.query.from || '').trim();
    const toDate = (req.query.to || '').trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '15', 10)));
    const offset = (page - 1) * limit;

    let whereSql = 'WHERE sr.archived_at IS NULL';
    const params = [];

    if (search) {
      whereSql += ' AND (sr.receipt_number LIKE ? OR c.name LIKE ? OR c.mobile LIKE ? OR sr.service_name_snapshot LIKE ?)';
      const wild = `%${search}%`;
      params.push(wild, wild, wild, wild);
    }

    if (status) {
      whereSql += ' AND sr.status = ?';
      params.push(status);
    }

    if (service) {
      whereSql += ' AND sr.service_name_snapshot = ?';
      params.push(service);
    }

    if (fromDate) {
      whereSql += ' AND DATE(sr.service_date) >= ?';
      params.push(fromDate);
    }

    if (toDate) {
      whereSql += ' AND DATE(sr.service_date) <= ?';
      params.push(toDate);
    }

    // Count
    const [countRow] = await query(
      `SELECT COUNT(*) as total 
       FROM service_records sr 
       JOIN customers c ON sr.customer_id = c.id 
       ${whereSql}`,
      params
    );
    const totalRecords = Number(countRow?.total || 0);

    // Records
    const rows = await query(
      `SELECT 
         sr.id, sr.receipt_number, sr.customer_id, sr.service_id, sr.service_name_snapshot,
         sr.total_charge, sr.status, sr.notes, sr.service_date, sr.created_at,
         c.name as customer_name, c.mobile as customer_mobile, c.customer_code,
         COALESCE(p.paid_sum, 0) as paid_amount,
         (sr.total_charge - COALESCE(p.paid_sum, 0)) as balance,
         notif.status as latest_sms_status
       FROM service_records sr
       JOIN customers c ON sr.customer_id = c.id
       LEFT JOIN (
         SELECT service_record_id, SUM(amount) as paid_sum 
         FROM payments 
         WHERE status = 'RECORDED' 
         GROUP BY service_record_id
       ) p ON sr.id = p.service_record_id
       LEFT JOIN (
         SELECT service_record_id, status 
         FROM notifications 
         WHERE id IN (
           SELECT MAX(id) FROM notifications GROUP BY service_record_id
         )
       ) notif ON sr.id = notif.service_record_id
       ${whereSql}
       ORDER BY sr.service_date DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: (rows || []).map((r) => ({
        ...r,
        total_charge: parseFloat(r.total_charge),
        paid_amount: parseFloat(r.paid_amount),
        balance: Math.max(0, parseFloat(r.balance)),
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
 * Create a new service record and initial payment in a transaction
 */
export async function createServiceRecord(req, res, next) {
  try {
    const data = createServiceRecordSchema.parse(req.body);

    if (data.amountPaid > data.totalCharge) {
      return res.status(400).json({
        success: false,
        field: 'amountPaid',
        message: `Amount received (₹${data.amountPaid}) cannot be more than the total charge (₹${data.totalCharge}).`,
      });
    }

    const remainingBalance = Math.max(0, data.totalCharge - data.amountPaid);
    let status = 'UNPAID';
    if (remainingBalance === 0 && data.totalCharge > 0) {
      status = 'PAID';
    } else if (data.amountPaid > 0) {
      status = 'PARTIALLY_PAID';
    } else if (data.totalCharge === 0) {
      status = 'PAID';
    }

    const receiptNumber = generateReceiptNumber();

    // Run in a managed database transaction
    const { serviceRecordId, paymentId, customerId } = await withTransaction(async (conn) => {
      let finalCustomerId = data.customerId;

      // If customerId is not provided, use direct customerName and customerMobile
      if (!finalCustomerId) {
        if (!data.customerName?.trim() || !data.customerMobile?.trim()) {
          const err = new Error('Please enter customer name and 10-digit mobile number.');
          err.field = !data.customerName?.trim() ? 'customerName' : 'customerMobile';
          throw err;
        }

        const normalizedMobile = normalizeMobile(data.customerMobile);
        if (!isValidIndianMobile(normalizedMobile)) {
          const err = new Error('Please enter a valid 10-digit mobile number (starting with 6, 7, 8, or 9).');
          err.field = 'customerMobile';
          throw err;
        }

        // Check if customer exists by normalized mobile
        const [existingCust] = await conn.query(
          'SELECT id, name, mobile FROM customers WHERE mobile_normalized = ? AND archived_at IS NULL',
          [normalizedMobile]
        );

        // Match existing customer if name matches (case-insensitive)
        const matchedCustomer = (existingCust || []).find(
          (c) => c.name.trim().toLowerCase() === data.customerName.trim().toLowerCase()
        );

        if (matchedCustomer) {
          finalCustomerId = matchedCustomer.id;
        } else {
          // If name is new or customer does not exist with this mobile, create a new customer record!
          const custCode = generateCustomerCode();
          const [insertCust] = await conn.query(
            `INSERT INTO customers (customer_code, name, mobile, mobile_normalized)
             VALUES (?, ?, ?, ?)`,
            [custCode, data.customerName.trim(), data.customerMobile.trim(), normalizedMobile]
          );
          finalCustomerId = insertCust.insertId || insertCust[0]?.id;
        }
      } else {
        // Verify customer exists
        const [custRows] = await conn.query(
          'SELECT id, name, mobile FROM customers WHERE id = ? AND archived_at IS NULL',
          [finalCustomerId]
        );
        if (!custRows || !custRows.length) {
          throw new Error('Selected customer does not exist or has been archived.');
        }
      }

      // Insert service record
      const [srResult] = await conn.query(
        `INSERT INTO service_records (
           receipt_number, customer_id, service_id, service_name_snapshot,
           total_charge, status, notes, created_by, service_date
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          receiptNumber,
          finalCustomerId,
          data.serviceId || null,
          data.serviceName.trim(),
          data.totalCharge,
          status,
          data.notes || null,
          req.user?.id || null,
        ]
      );

      const recordId = srResult.insertId || srResult[0]?.id;
      let payId = null;

      // If initial payment received, insert payment record
      if (data.amountPaid > 0) {
        const [payResult] = await conn.query(
          `INSERT INTO payments (
             service_record_id, amount, payment_method, transaction_reference,
             received_at, received_by, status, notes
           ) VALUES (?, ?, ?, ?, NOW(), ?, 'RECORDED', 'Initial payment upon service creation')`,
          [
            recordId,
            data.amountPaid,
            data.paymentMethod,
            data.transactionReference || null,
            req.user?.id || null,
          ]
        );
        payId = payResult.insertId || payResult[0]?.id;
      }

      return { serviceRecordId: recordId, paymentId: payId, customerId: finalCustomerId };
    });

    // Transaction committed successfully!
    await logAudit({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'SERVICE_RECORD_CREATED',
      entityType: 'SERVICE_RECORD',
      entityId: String(serviceRecordId),
      metadata: {
        receiptNumber,
        serviceName: data.serviceName,
        totalCharge: data.totalCharge,
        amountPaid: data.amountPaid,
        balance: remainingBalance,
      },
      ipAddress: req.ip,
    });

    // SMS dispatch (safe outbox pattern, after committed transaction)
    let smsResult = null;
    if (data.sendSms) {
      try {
        smsResult = await queueAndSendReceiptSms({
          serviceRecordId,
          paymentId,
          userId: req.user?.id,
        });
      } catch (smsErr) {
        console.warn('SMS dispatch error:', smsErr.message);
        smsResult = {
          success: false,
          status: 'FAILED',
          error: smsErr.message,
        };
      }
    }

    res.status(201).json({
      success: true,
      message: 'Service record created successfully',
      data: {
        id: serviceRecordId,
        receiptNumber,
        serviceName: data.serviceName,
        totalCharge: data.totalCharge,
        amountPaid: data.amountPaid,
        remainingBalance,
        status,
        paymentId,
        sms: smsResult,
      },
    });
  } catch (err) {
    if (err.field) {
      return res.status(400).json({
        success: false,
        field: err.field,
        message: err.message,
      });
    }
    next(err);
  }
}

/**
 * Get single service record by ID
 */
export async function getServiceRecordById(req, res, next) {
  try {
    const recordId = req.params.id;

    const [record] = await query(
      `SELECT sr.*, c.name as customer_name, c.mobile as customer_mobile, c.customer_code, c.email as customer_email,
              u.username as created_by_username
       FROM service_records sr
       JOIN customers c ON sr.customer_id = c.id
       LEFT JOIN users u ON sr.created_by = u.id
       WHERE sr.id = ? AND sr.archived_at IS NULL`,
      [recordId]
    );

    if (!record) {
      return res.status(404).json({ success: false, message: 'Service record not found' });
    }

    const payments = await query(
      `SELECT p.*, u.username as received_by_username 
       FROM payments p
       LEFT JOIN users u ON p.received_by = u.id
       WHERE p.service_record_id = ? 
       ORDER BY p.received_at ASC`,
      [recordId]
    );

    const notifications = await query(
      `SELECT * FROM notifications WHERE service_record_id = ? ORDER BY created_at DESC`,
      [recordId]
    );

    const paidSum = (payments || [])
      .filter((p) => p.status === 'RECORDED')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const totalCharge = parseFloat(record.total_charge);
    const balance = Math.max(0, totalCharge - paidSum);

    res.json({
      success: true,
      data: {
        ...record,
        total_charge: totalCharge,
        paid_amount: paidSum,
        balance,
        payments: (payments || []).map((p) => ({ ...p, amount: parseFloat(p.amount) })),
        notifications,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get print-friendly receipt payload
 */
export async function getReceiptData(req, res, next) {
  try {
    const recordId = req.params.id;

    const [record] = await query(
      `SELECT sr.id, sr.receipt_number, sr.service_name_snapshot, sr.total_charge,
              sr.status, sr.service_date, sr.notes,
              c.name as customer_name, c.mobile as customer_mobile, c.customer_code
       FROM service_records sr
       JOIN customers c ON sr.customer_id = c.id
       WHERE sr.id = ? AND sr.archived_at IS NULL`,
      [recordId]
    );

    if (!record) {
      return res.status(404).json({ success: false, message: 'Service record not found' });
    }

    const payments = await query(
      `SELECT id, amount, payment_method, transaction_reference, received_at, status 
       FROM payments 
       WHERE service_record_id = ? AND status = 'RECORDED' 
       ORDER BY received_at ASC`,
      [recordId]
    );

    // Load centre settings
    const settingsRows = await query('SELECT setting_key, setting_value FROM settings');
    const settingsMap = {};
    (settingsRows || []).forEach((r) => {
      settingsMap[r.setting_key] = r.setting_value;
    });

    const totalCharge = parseFloat(record.total_charge);
    const totalPaid = (payments || []).reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const balance = Math.max(0, totalCharge - totalPaid);

    res.json({
      success: true,
      data: {
        centre: {
          name: settingsMap.centre_name || config.centreDefaults.name,
          code: settingsMap.centre_code || config.centreDefaults.code,
          phone: settingsMap.centre_phone || config.centreDefaults.phone,
          address: settingsMap.centre_address || config.centreDefaults.address,
          receiptFooter: settingsMap.receipt_footer || config.centreDefaults.receiptFooter,
        },
        receipt: {
          receiptNumber: record.receipt_number,
          date: record.service_date,
          customerName: record.customer_name,
          customerMobile: record.customer_mobile,
          customerCode: record.customer_code,
          serviceName: record.service_name_snapshot,
          notes: record.notes,
          totalCharge,
          totalPaid,
          balance,
          status: record.status,
          payments: (payments || []).map((p) => ({
            ...p,
            amount: parseFloat(p.amount),
          })),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}
