import { query } from '../db/connection.js';

/**
 * Clean cell for Excel-safe CSV export (prevent CSV formula injection with =, +, -, @)
 */
function escapeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str; // prepend single quote to neutralize formula
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Collection Report (actual payments received)
 */
export async function getCollectionReport(req, res, next) {
  try {
    const fromDate = req.query.from || new Date().toISOString().slice(0, 10);
    const toDate = req.query.to || new Date().toISOString().slice(0, 10);

    // Payments breakdown
    const rows = await query(
      `SELECT 
         p.id as payment_id, p.amount, p.payment_method, p.transaction_reference,
         p.received_at, p.status,
         sr.id as service_record_id, sr.receipt_number, sr.service_name_snapshot,
         c.name as customer_name, c.mobile as customer_mobile
       FROM payments p
       JOIN service_records sr ON p.service_record_id = sr.id
       JOIN customers c ON sr.customer_id = c.id
       WHERE DATE(p.received_at) >= ? AND DATE(p.received_at) <= ? AND p.status = 'RECORDED'
       ORDER BY p.received_at DESC`,
      [fromDate, toDate]
    );

    // Method breakdown summary
    const methodSummary = await query(
      `SELECT payment_method, COUNT(*) as count, SUM(amount) as total 
       FROM payments 
       WHERE DATE(received_at) >= ? AND DATE(received_at) <= ? AND status = 'RECORDED'
       GROUP BY payment_method`,
      [fromDate, toDate]
    );

    const totalCollected = rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

    res.json({
      success: true,
      period: { from: fromDate, to: toDate },
      summary: {
        totalCollected,
        transactionCount: rows.length,
        byMethod: methodSummary.map((m) => ({
          method: m.payment_method,
          count: Number(m.count),
          total: parseFloat(m.total),
        })),
      },
      data: rows.map((r) => ({
        ...r,
        amount: parseFloat(r.amount),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Outstanding Balance Report
 */
export async function getOutstandingReport(req, res, next) {
  try {
    const rows = await query(
      `SELECT 
         sr.id, sr.receipt_number, sr.service_name_snapshot, sr.total_charge,
         sr.status, sr.service_date,
         DATEDIFF(NOW(), sr.service_date) as days_pending,
         c.id as customer_id, c.customer_code, c.name as customer_name, c.mobile as customer_mobile,
         COALESCE(p.paid_sum, 0) as paid_amount,
         (sr.total_charge - COALESCE(p.paid_sum, 0)) as balance
       FROM service_records sr
       JOIN customers c ON sr.customer_id = c.id
       LEFT JOIN (
         SELECT service_record_id, SUM(amount) as paid_sum 
         FROM payments 
         WHERE status = 'RECORDED' 
         GROUP BY service_record_id
       ) p ON sr.id = p.service_record_id
       WHERE sr.archived_at IS NULL 
         AND (sr.total_charge - COALESCE(p.paid_sum, 0)) > 0
       ORDER BY balance DESC, sr.service_date ASC`
    );

    const totalOutstanding = rows.reduce((sum, r) => sum + parseFloat(r.balance), 0);

    res.json({
      success: true,
      summary: {
        totalOutstanding,
        recordCount: rows.length,
      },
      data: rows.map((r) => ({
        ...r,
        total_charge: parseFloat(r.total_charge),
        paid_amount: parseFloat(r.paid_amount),
        balance: parseFloat(r.balance),
        days_pending: Number(r.days_pending),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Services Breakdown Report
 */
export async function getServicesReport(req, res, next) {
  try {
    const fromDate = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const toDate = req.query.to || new Date().toISOString().slice(0, 10);

    const rows = await query(
      `SELECT 
         sr.service_name_snapshot as service_name,
         COUNT(*) as total_count,
         SUM(sr.total_charge) as total_revenue,
         SUM(CASE WHEN sr.status = 'PAID' THEN 1 ELSE 0 END) as paid_count,
         SUM(CASE WHEN sr.status != 'PAID' THEN 1 ELSE 0 END) as pending_count
       FROM service_records sr
       WHERE sr.archived_at IS NULL 
         AND DATE(sr.service_date) >= ? AND DATE(sr.service_date) <= ?
       GROUP BY sr.service_name_snapshot
       ORDER BY total_count DESC`,
      [fromDate, toDate]
    );

    res.json({
      success: true,
      period: { from: fromDate, to: toDate },
      data: rows.map((r) => ({
        service_name: r.service_name,
        total_count: Number(r.total_count),
        total_revenue: parseFloat(r.total_revenue || 0),
        paid_count: Number(r.paid_count),
        pending_count: Number(r.pending_count),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * CSV Export for Collections or Outstanding balances
 */
export async function exportCsv(req, res, next) {
  try {
    const type = req.query.type || 'collections';
    const fromDate = req.query.from || new Date().toISOString().slice(0, 10);
    const toDate = req.query.to || new Date().toISOString().slice(0, 10);

    let filename = `sevadesk-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    let csvHeader = '';
    let csvRows = [];

    if (type === 'outstanding') {
      filename = `sevadesk-outstanding-${new Date().toISOString().slice(0, 10)}.csv`;
      csvHeader = 'Receipt Number,Customer Name,Mobile,Service,Total Charge (INR),Amount Paid (INR),Remaining Balance (INR),Days Pending,Date\n';

      const rows = await query(
        `SELECT 
           sr.receipt_number, c.name as customer_name, c.mobile as customer_mobile,
           sr.service_name_snapshot, sr.total_charge, sr.service_date,
           DATEDIFF(NOW(), sr.service_date) as days_pending,
           COALESCE(p.paid_sum, 0) as paid_amount,
           (sr.total_charge - COALESCE(p.paid_sum, 0)) as balance
         FROM service_records sr
         JOIN customers c ON sr.customer_id = c.id
         LEFT JOIN (
           SELECT service_record_id, SUM(amount) as paid_sum 
           FROM payments 
           WHERE status = 'RECORDED' 
           GROUP BY service_record_id
         ) p ON sr.id = p.service_record_id
         WHERE sr.archived_at IS NULL 
           AND (sr.total_charge - COALESCE(p.paid_sum, 0)) > 0
         ORDER BY balance DESC`
      );

      csvRows = rows.map((r) => [
        escapeCsvCell(r.receipt_number),
        escapeCsvCell(r.customer_name),
        escapeCsvCell(r.customer_mobile),
        escapeCsvCell(r.service_name_snapshot),
        parseFloat(r.total_charge).toFixed(2),
        parseFloat(r.paid_amount).toFixed(2),
        parseFloat(r.balance).toFixed(2),
        r.days_pending,
        new Date(r.service_date).toLocaleDateString('en-IN'),
      ].join(','));
    } else {
      // Collections CSV
      filename = `sevadesk-collections-${fromDate}-to-${toDate}.csv`;
      csvHeader = 'Payment ID,Receipt Number,Customer Name,Mobile,Service,Amount (INR),Payment Method,Reference,Payment Date\n';

      const rows = await query(
        `SELECT 
           p.id as payment_id, p.amount, p.payment_method, p.transaction_reference, p.received_at,
           sr.receipt_number, sr.service_name_snapshot,
           c.name as customer_name, c.mobile as customer_mobile
         FROM payments p
         JOIN service_records sr ON p.service_record_id = sr.id
         JOIN customers c ON sr.customer_id = c.id
         WHERE DATE(p.received_at) >= ? AND DATE(p.received_at) <= ? AND p.status = 'RECORDED'
         ORDER BY p.received_at DESC`,
        [fromDate, toDate]
      );

      csvRows = rows.map((r) => [
        r.payment_id,
        escapeCsvCell(r.receipt_number),
        escapeCsvCell(r.customer_name),
        escapeCsvCell(r.customer_mobile),
        escapeCsvCell(r.service_name_snapshot),
        parseFloat(r.amount).toFixed(2),
        escapeCsvCell(r.payment_method),
        escapeCsvCell(r.transaction_reference || 'N/A'),
        new Date(r.received_at).toLocaleString('en-IN'),
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csvHeader + csvRows.join('\n')); // BOM for Excel UTF-8 support
  } catch (err) {
    next(err);
  }
}
