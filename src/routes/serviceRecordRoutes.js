import { Router } from 'express';
import {
  getServiceRecords,
  createServiceRecord,
  getServiceRecordById,
  getReceiptData,
} from '../controllers/serviceRecordController.js';
import { resendReceiptSms } from '../controllers/notificationController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { writeLimiter, smsLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(authenticate);

router.get('/', getServiceRecords);
router.post('/', writeLimiter, createServiceRecord);
router.get('/:id', getServiceRecordById);
router.get('/:id/receipt', getReceiptData);
router.post('/:id/send-receipt', smsLimiter, resendReceiptSms);

export default router;
