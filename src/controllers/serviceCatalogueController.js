import { z } from 'zod';
import { query } from '../db/connection.js';
import { logAudit } from '../services/auditService.js';

const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Service name must be at least 2 characters'),
  category: z.string().trim().default('General'),
  defaultCharge: z.number().min(0, 'Charge cannot be negative').default(0),
  isPinned: z.boolean().default(false),
});

/**
 * List all active services
 */
export async function getServices(req, res, next) {
  try {
    const rows = await query(
      `SELECT id, category, name, default_charge, is_pinned, is_active, created_at 
       FROM services 
       WHERE is_active = TRUE 
       ORDER BY is_pinned DESC, category ASC, name ASC`
    );

    res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        default_charge: parseFloat(r.default_charge),
        is_pinned: Boolean(r.is_pinned),
        is_active: Boolean(r.is_active),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new service in catalogue
 */
export async function createService(req, res, next) {
  try {
    const data = serviceSchema.parse(req.body);

    const result = await query(
      `INSERT INTO services (category, name, default_charge, is_pinned, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [data.category, data.name, data.defaultCharge, data.isPinned]
    );

    await logAudit({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'SERVICE_CATALOGUE_ADDED',
      entityType: 'SERVICE',
      entityId: String(result.insertId),
      metadata: { name: data.name, defaultCharge: data.defaultCharge },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: 'Service added to catalogue',
      data: {
        id: result.insertId,
        category: data.category,
        name: data.name,
        default_charge: data.defaultCharge,
        is_pinned: data.isPinned,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update service details (charge, pinned status, name)
 */
export async function updateService(req, res, next) {
  try {
    const serviceId = req.params.id;
    const { name, category, defaultCharge, isPinned } = req.body;

    const [existing] = await query('SELECT * FROM services WHERE id = ?', [serviceId]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    await query(
      `UPDATE services 
       SET name = COALESCE(?, name),
           category = COALESCE(?, category),
           default_charge = COALESCE(?, default_charge),
           is_pinned = COALESCE(?, is_pinned),
           updated_at = NOW()
       WHERE id = ?`,
      [
        name ? name.trim() : null,
        category ? category.trim() : null,
        defaultCharge !== undefined ? parseFloat(defaultCharge) : null,
        isPinned !== undefined ? Boolean(isPinned) : null,
        serviceId,
      ]
    );

    await logAudit({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'SERVICE_CATALOGUE_UPDATED',
      entityType: 'SERVICE',
      entityId: String(serviceId),
      metadata: { name, defaultCharge, isPinned },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Service updated successfully',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Archive / Toggle service active status
 */
export async function toggleArchiveService(req, res, next) {
  try {
    const serviceId = req.params.id;
    const [existing] = await query('SELECT id, is_active FROM services WHERE id = ?', [serviceId]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const newStatus = !existing.is_active;
    await query('UPDATE services SET is_active = ?, updated_at = NOW() WHERE id = ?', [newStatus, serviceId]);

    res.json({
      success: true,
      message: `Service ${newStatus ? 'activated' : 'archived'} successfully`,
    });
  } catch (err) {
    next(err);
  }
}
