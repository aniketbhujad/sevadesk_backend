import { z } from 'zod';
import { query } from '../db/connection.js';
import { normalizeMobile, isValidIndianMobile } from '../utils/phone.js';
import { generateCustomerCode } from '../utils/idGenerator.js';
import { logAudit } from '../services/auditService.js';

const customerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  mobile: z.string().trim().refine(isValidIndianMobile, {
    message: 'Please provide a valid 10-digit mobile number',
  }),
  email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(1000).optional(),
  allowDuplicateMobile: z.boolean().optional(),
});

/**
 * List / Search customers with pagination
 */
export async function getCustomers(req, res, next) {
  try {
    const search = (req.query.search || '').trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '15', 10)));
    const offset = (page - 1) * limit;

    let whereSql = 'WHERE c.archived_at IS NULL';
    const params = [];

    if (search) {
      const normalizedSearch = normalizeMobile(search);
      whereSql += ` AND (
        c.name LIKE ? OR 
        c.customer_code LIKE ? OR 
        c.mobile LIKE ? OR 
        c.mobile_normalized LIKE ?
      )`;
      const searchWild = `%${search}%`;
      const normWild = `%${normalizedSearch}%`;
      params.push(searchWild, searchWild, searchWild, normWild);
    }

    // Count query
    const [countRow] = await query(
      `SELECT COUNT(*) as total FROM customers c ${whereSql}`,
      params
    );
    const totalRecords = Number(countRow.total || 0);

    // Data query with outstanding balance preview
    const rows = await query(
      `SELECT 
         c.id, c.customer_code, c.name, c.mobile, c.email, c.address, c.notes, c.created_at,
         COUNT(DISTINCT sr.id) as total_services,
         COALESCE(SUM(sr.total_charge), 0) as total_billed,
         COALESCE(SUM(p.paid_sum), 0) as total_paid,
         (COALESCE(SUM(sr.total_charge), 0) - COALESCE(SUM(p.paid_sum), 0)) as total_balance
       FROM customers c
       LEFT JOIN service_records sr ON c.id = sr.customer_id AND sr.archived_at IS NULL
       LEFT JOIN (
         SELECT service_record_id, SUM(amount) as paid_sum 
         FROM payments 
         WHERE status = 'RECORDED' 
         GROUP BY service_record_id
       ) p ON sr.id = p.service_record_id
       ${whereSql}
       GROUP BY c.id, c.customer_code, c.name, c.mobile, c.email, c.address, c.notes, c.created_at
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        total_services: Number(r.total_services),
        total_billed: parseFloat(r.total_billed),
        total_paid: parseFloat(r.total_paid),
        total_balance: Math.max(0, parseFloat(r.total_balance)),
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
 * Check if a customer already exists by mobile number
 */
export async function checkMobileDuplicate(req, res, next) {
  try {
    const rawMobile = req.query.mobile || '';
    const normalized = normalizeMobile(rawMobile);

    if (!normalized || normalized.length < 10) {
      return res.json({ success: true, exists: false });
    }

    const [existing] = await query(
      `SELECT id, customer_code, name, mobile, created_at 
       FROM customers 
       WHERE mobile_normalized = ? AND archived_at IS NULL 
       LIMIT 1`,
      [normalized]
    );

    if (existing) {
      return res.json({
        success: true,
        exists: true,
        customer: existing,
      });
    }

    res.json({ success: true, exists: false });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new customer
 */
export async function createCustomer(req, res, next) {
  try {
    const data = customerSchema.parse(req.body);
    const normalizedMobile = normalizeMobile(data.mobile);

    // Check duplicate unless explicitly confirmed
    if (!data.allowDuplicateMobile) {
      const [existing] = await query(
        'SELECT id, customer_code, name, mobile FROM customers WHERE mobile_normalized = ? AND archived_at IS NULL LIMIT 1',
        [normalizedMobile]
      );

      if (existing) {
        return res.status(409).json({
          success: false,
          isDuplicate: true,
          message: `A customer with mobile number ${data.mobile} already exists: ${existing.name} (${existing.customer_code})`,
          existingCustomer: existing,
        });
      }
    }

    const customerCode = generateCustomerCode();

    const result = await query(
      `INSERT INTO customers (customer_code, name, mobile, mobile_normalized, email, address, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        customerCode,
        data.name.trim(),
        data.mobile.trim(),
        normalizedMobile,
        data.email ? data.email.trim() : null,
        data.address ? data.address.trim() : null,
        data.notes ? data.notes.trim() : null,
      ]
    );

    const newCustomerId = result.insertId || result[0]?.id;

    await logAudit({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'CUSTOMER_CREATED',
      entityType: 'CUSTOMER',
      entityId: String(newCustomerId),
      metadata: { customerCode, name: data.name },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: {
        id: newCustomerId,
        customer_code: customerCode,
        name: data.name,
        mobile: data.mobile,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get customer by ID
 */
export async function getCustomerById(req, res, next) {
  try {
    const customerId = req.params.id;
    const [customer] = await query('SELECT * FROM customers WHERE id = ?', [customerId]);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    res.json({
      success: true,
      data: customer,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update customer details
 */
export async function updateCustomer(req, res, next) {
  try {
    const customerId = req.params.id;
    const { name, mobile, email, address, notes } = req.body;

    const [existing] = await query('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const updatedName = name ? name.trim() : existing.name;
    let updatedMobile = existing.mobile;
    let normalized = existing.mobile_normalized;

    if (mobile) {
      if (!isValidIndianMobile(mobile)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid 10-digit mobile number',
        });
      }
      updatedMobile = mobile.trim();
      normalized = normalizeMobile(updatedMobile);
    }

    await query(
      `UPDATE customers 
       SET name = ?, mobile = ?, mobile_normalized = ?, email = ?, address = ?, notes = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        updatedName,
        updatedMobile,
        normalized,
        email !== undefined ? (email ? email.trim() : null) : existing.email,
        address !== undefined ? (address ? address.trim() : null) : existing.address,
        notes !== undefined ? (notes ? notes.trim() : null) : existing.notes,
        customerId,
      ]
    );

    await logAudit({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'CUSTOMER_UPDATED',
      entityType: 'CUSTOMER',
      entityId: String(customerId),
      metadata: {
        before: { name: existing.name, mobile: existing.mobile },
        after: { name: updatedName, mobile: updatedMobile },
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Customer updated successfully',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get customer service history and payment breakdown
 */
export async function getCustomerHistory(req, res, next) {
  try {
    const customerId = req.params.id;

    const [customer] = await query('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const services = await query(
      `SELECT sr.id, sr.receipt_number, sr.service_name_snapshot, sr.total_charge,
              sr.status, sr.service_date, sr.notes,
              COALESCE(p.paid_sum, 0) as paid_amount,
              (sr.total_charge - COALESCE(p.paid_sum, 0)) as balance
       FROM service_records sr
       LEFT JOIN (
         SELECT service_record_id, SUM(amount) as paid_sum 
         FROM payments 
         WHERE status = 'RECORDED' 
         GROUP BY service_record_id
       ) p ON sr.id = p.service_record_id
       WHERE sr.customer_id = ? AND sr.archived_at IS NULL
       ORDER BY sr.service_date DESC`,
      [customerId]
    );

    // Compute customer totals
    let totalBilled = 0;
    let totalPaid = 0;
    const formattedServices = services.map((s) => {
      const charge = parseFloat(s.total_charge);
      const paid = parseFloat(s.paid_amount);
      const bal = Math.max(0, charge - paid);
      totalBilled += charge;
      totalPaid += paid;

      return {
        ...s,
        total_charge: charge,
        paid_amount: paid,
        balance: bal,
      };
    });

    res.json({
      success: true,
      customer,
      summary: {
        totalServices: services.length,
        totalBilled,
        totalPaid,
        totalOutstanding: Math.max(0, totalBilled - totalPaid),
      },
      services: formattedServices,
    });
  } catch (err) {
    next(err);
  }
}
