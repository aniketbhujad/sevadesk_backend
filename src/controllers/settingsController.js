import { z } from 'zod';
import { query } from '../db/connection.js';
import { logAudit } from '../services/auditService.js';
import { config } from '../config/env.js';

const settingsUpdateSchema = z.object({
  centre_name: z.string().trim().min(2).optional(),
  centre_code: z.string().trim().optional(),
  centre_phone: z.string().trim().optional(),
  centre_address: z.string().trim().optional(),
  receipt_footer: z.string().trim().optional(),
  sms_enabled: z.enum(['true', 'false']).optional(),
  sms_template: z.string().trim().min(10).optional(),
  timezone: z.string().trim().optional(),
});

/**
 * Get all public / operator settings
 */
export async function getSettings(req, res, next) {
  try {
    const rows = await query('SELECT setting_key, setting_value FROM settings');
    const settingsMap = {
      centre_name: config.centreDefaults.name,
      centre_code: config.centreDefaults.code,
      centre_phone: config.centreDefaults.phone,
      centre_address: config.centreDefaults.address,
      receipt_footer: config.centreDefaults.receiptFooter,
      currency: config.centreDefaults.currency,
      timezone: config.centreDefaults.timezone,
      sms_enabled: config.sms.enabled ? 'true' : 'false',
      sms_template: config.sms.template,
    };

    rows.forEach((r) => {
      // Disallow leaking sensitive internal keys if any were saved
      if (!r.setting_key.includes('secret') && !r.setting_key.includes('password') && !r.setting_key.includes('key')) {
        settingsMap[r.setting_key] = r.setting_value;
      }
    });

    // Provide safe metadata about AWS status (whether configured or mock)
    const awsConfigured = Boolean(config.sms.accessKeyId || process.env.AWS_PROFILE);
    const smsStatusInfo = {
      isEnabled: settingsMap.sms_enabled === 'true',
      provider: settingsMap.sms_enabled === 'true' ? (awsConfigured ? 'AWS End User Messaging SMS' : 'AWS SDK (Default IAM/Chain)') : 'Mock SMS Provider (Zero Cost)',
      region: config.sms.region,
      mode: settingsMap.sms_enabled === 'true' ? 'Live / Provider' : 'Development Mock',
    };

    res.json({
      success: true,
      data: settingsMap,
      smsInfo: smsStatusInfo,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update system settings (Admin only)
 */
export async function updateSettings(req, res, next) {
  try {
    const data = settingsUpdateSchema.parse(req.body);

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        await query(
          `INSERT INTO settings (setting_key, setting_value) 
           VALUES (?, ?) 
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`,
          [key, String(value)]
        );
      }
    }

    await logAudit({
      userId: req.user?.id,
      username: req.user?.username,
      action: 'SETTINGS_UPDATED',
      entityType: 'SETTINGS',
      entityId: 'SYSTEM',
      metadata: data,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Settings updated successfully',
    });
  } catch (err) {
    next(err);
  }
}
