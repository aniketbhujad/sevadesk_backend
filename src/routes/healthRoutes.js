import { Router } from 'express';
import { testConnection } from '../db/connection.js';
import { config } from '../config/env.js';

const router = Router();

router.get('/health', async (req, res) => {
  const dbStatus = await testConnection();

  res.json({
    status: dbStatus.ok ? 'healthy' : 'degraded',
    app: 'SevaDesk CRM',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      connected: dbStatus.ok,
      ...(dbStatus.ok ? {} : { error: dbStatus.error }),
    },
    sms: {
      enabled: config.sms.enabled,
      mode: config.sms.enabled ? 'live' : 'mock',
    },
  });
});

export default router;
