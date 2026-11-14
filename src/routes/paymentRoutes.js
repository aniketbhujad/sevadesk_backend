import { Router } from 'express';
import { addPayment, getPaymentsForRecord } from '../controllers/paymentController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { writeLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(authenticate);

router.post('/:id/payments', writeLimiter, addPayment);
router.get('/:id/payments', getPaymentsForRecord);

export default router;
