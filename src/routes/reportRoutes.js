import { Router } from 'express';
import {
  getCollectionReport,
  getOutstandingReport,
  getServicesReport,
  exportCsv,
} from '../controllers/reportController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/collections', getCollectionReport);
router.get('/outstanding', getOutstandingReport);
router.get('/services', getServicesReport);
router.get('/export.csv', exportCsv);

export default router;
