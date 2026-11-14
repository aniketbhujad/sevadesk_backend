import { query } from '../db/connection.js';

export async function getDashboardSummary(req, res, next) {
  try {
    // 1. Total customers count
    const [custTotal] = await query('SELECT COUNT(*) as count FROM customers WHERE archived_at IS NULL');
    
    // 2. Customers added today
    const [custToday] = await query(
      'SELECT COUNT(*) as count FROM customers WHERE DATE(created_at) = CURRENT_DATE AND archived_at IS NULL'
    );

    // 3. Service records created today (Transactions generated)
    const [servicesToday] = await query(
      'SELECT COUNT(*) as count FROM service_records WHERE DATE(service_date) = CURRENT_DATE AND archived_at IS NULL'
    );

    // 4. Today's amount collected (actual payments received today)
    const [collectionToday] = await query(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM payments 
       WHERE DATE(received_at) = CURRENT_DATE AND status = 'RECORDED'`
    );

    // 5. This Month's Collection (current month payments)
    const [collectionMonth] = await query(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM payments 
       WHERE EXTRACT(MONTH FROM received_at) = EXTRACT(MONTH FROM CURRENT_DATE) 
         AND EXTRACT(YEAR FROM received_at) = EXTRACT(YEAR FROM CURRENT_DATE) 
         AND status = 'RECORDED'`
    );

    // 6. Total outstanding balance across all non-archived service records
    const [outstandingSummary] = await query(
      `SELECT 
         COUNT(*) as count,
         COALESCE(SUM(sr.total_charge - COALESCE(p.paid_sum, 0)), 0) as total_outstanding
       FROM service_records sr
       LEFT JOIN (
         SELECT service_record_id, SUM(amount) as paid_sum 
         FROM payments 
         WHERE status = 'RECORDED' 
         GROUP BY service_record_id
       ) p ON sr.id = p.service_record_id
       WHERE sr.archived_at IS NULL 
         AND (sr.total_charge - COALESCE(p.paid_sum, 0)) > 0`
    );

    // 7. Recent service transactions
    const recentRecords = await query(
      `SELECT sr.id, sr.receipt_number, sr.service_name_snapshot, sr.total_charge,
              sr.status, sr.service_date, c.name as customer_name, c.mobile as customer_mobile,
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
       ORDER BY sr.service_date DESC
       LIMIT 8`
    );

    res.json({
      success: true,
      data: {
        totalCustomers: Number(custTotal?.count || 0),
        customersAddedToday: Number(custToday?.count || 0),
        servicesToday: Number(servicesToday?.count || 0),
        todayCollection: parseFloat(collectionToday?.total || 0),
        monthlyCollection: parseFloat(collectionMonth?.total || 0),
        totalOutstanding: parseFloat(outstandingSummary?.total_outstanding || 0),
        outstandingCount: Number(outstandingSummary?.count || 0),
        currency: 'INR',
        currencySymbol: '₹',
        recentTransactions: (recentRecords || []).map((r) => ({
          ...r,
          total_charge: parseFloat(r.total_charge),
          paid_amount: parseFloat(r.paid_amount),
          balance: parseFloat(r.balance),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}
