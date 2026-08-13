// src/modules/commercial/commercial.routes.js
import { Router } from 'express';
import { 
  getRequests, 
  getCommercialOptions, 
  createRequest, 
  updateRequest, 
  deleteRequest 
} from './commercial.controller.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

const router = Router();

// Apply Authentication (All valid users can hit these routes)
router.use(requireAuth);

router.get('/', getRequests);
router.get('/options', getCommercialOptions); // MUST be above /:id
router.post('/', createRequest);
router.put('/:id', updateRequest);
router.delete('/:id', deleteRequest);

export default router;