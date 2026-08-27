import { Router } from 'express';
import { 
  getOrders,
  getOrderDetails,
  createOrder,
  updateOrder,
  deleteOrder,
  getOrderLines,
  createOrderLine,
  updateOrderLine,
  deleteOrderLine
} from './orders.controller.js';
import { requireAuth, requireRole, requirePlatformOwner } from '../../middleware/authMiddleware.js';

const router = Router();

// Apply Authentication and basic Role check to ALL order routes (allows reading)
router.use(requireAuth);
router.use(requireRole(['full', 'commercial']));


// 1. Order Core Routes
router.get('/', getOrders);
router.get('/:id', getOrderDetails);

// Protected Core Mutations
router.post('/', requirePlatformOwner, createOrder);
router.put('/:id', requirePlatformOwner, updateOrder);
router.delete('/:id', requirePlatformOwner, deleteOrder);

// 2. Order Line Items Routes
router.get('/:orderId/lines', getOrderLines);

// Protected Line Mutations
router.post('/:id/lines', requirePlatformOwner, createOrderLine);         
router.put('/lines/:lineId', requirePlatformOwner, updateOrderLine);      
router.delete('/lines/:lineId', requirePlatformOwner, deleteOrderLine);   

export default router;