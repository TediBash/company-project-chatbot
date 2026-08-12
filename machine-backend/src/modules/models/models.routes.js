// src/modules/models/models.routes.js
import { Router } from 'express';
import { 
  getModels, 
  createModel, 
  updateModel, 
  toggleModelStatus, 
  deleteModel 
} from './models.controller.js';
import { requireAuth, requireRole, requirePlatformOwner } from '../../middleware/authMiddleware.js';

const router = Router();

// Apply Security: Valid token + AROL Super Admin only
router.use(requireAuth);
router.use(requirePlatformOwner);

// Routes
router.get('/', getModels);
router.post('/', createModel);
router.put('/:id', updateModel);
router.patch('/:id/status', toggleModelStatus);
router.delete('/:id', deleteModel);

export default router;