import { Router } from 'express';
import { getNotifications, retryNotification } from '../controllers/notificationController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { smsLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(authenticate);

router.get('/', getNotifications);
router.post('/:id/retry', smsLimiter, retryNotification);

export default router;
