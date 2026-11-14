import { Router } from 'express';
import {
  getServices,
  createService,
  updateService,
  toggleArchiveService,
} from '../controllers/serviceCatalogueController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/', getServices);
router.post('/', requireRole('ADMIN'), createService);
router.patch('/:id', requireRole('ADMIN'), updateService);
router.patch('/:id/archive', requireRole('ADMIN'), toggleArchiveService);

export default router;
