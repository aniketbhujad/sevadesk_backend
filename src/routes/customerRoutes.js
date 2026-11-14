import { Router } from 'express';
import {
  getCustomers,
  createCustomer,
  getCustomerById,
  updateCustomer,
  getCustomerHistory,
  checkMobileDuplicate,
} from '../controllers/customerController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { writeLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(authenticate);

router.get('/', getCustomers);
router.get('/check-mobile', checkMobileDuplicate);
router.post('/', writeLimiter, createCustomer);
router.get('/:id', getCustomerById);
router.patch('/:id', writeLimiter, updateCustomer);
router.get('/:id/history', getCustomerHistory);

export default router;
