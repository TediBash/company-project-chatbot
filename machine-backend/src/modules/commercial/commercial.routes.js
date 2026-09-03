// src/modules/commercial/commercial.routes.js
import { Router } from 'express';
import { 
  getRequests, 
  getCommercialOptions, 
  createRequest, 
  updateRequest, 
  deleteRequest,
  getMachinePurchaseDetails,
  getMachineQuotations,
  getSparePartsCatalog,
  getOrderHistory,
  getMachineOrderLines
} from './commercial.controller.js';
import { requireAuth, requireRole } from '../../middleware/authMiddleware.js';

const router = Router();

// Apply Authentication (All valid users can hit these routes)
router.use(requireAuth);

router.get('/', getRequests);
router.get('/options', getCommercialOptions);
router.post('/', createRequest);
router.put('/:id', updateRequest);
router.delete('/:id', deleteRequest);

router.get('/parts', requireRole(['full', 'commercial']), getSparePartsCatalog);
router.get('/orders', requireRole(['full', 'commercial']), getOrderHistory);
router.get('/machines/:machineId/purchase-details', requireRole(['full', 'commercial']), getMachinePurchaseDetails);
router.get('/machines/:machineId/quotations', requireRole(['full', 'commercial']), getMachineQuotations);
router.get('/machines/:machineId/order-lines', requireRole(['full', 'commercial']),getMachineOrderLines);

export default router;