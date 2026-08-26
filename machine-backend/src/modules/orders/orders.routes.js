// src/api/routes/orders.routes.js
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
import { requireAuth, requireRole } from '../../middleware/authMiddleware.js';

const router = Router();

router.use(requireAuth);
router.use(requireRole(['full', 'commercial']));

// 1. Order Core Routes
router.get('/', getOrders);
router.post('/', createOrder);
router.get('/:id', getOrderDetails);
router.put('/:id', updateOrder);
router.delete('/:id', deleteOrder);

// 2. Order Line Items Routes
router.get('/:orderId/lines', getOrderLines);       // Get all lines for a specific order
router.post('/:id/lines', createOrderLine);         // Add a line to an order
router.put('/lines/:lineId', updateOrderLine);      // Update a specific line item status
router.delete('/lines/:lineId', deleteOrderLine);   // Delete a specific line item

export default router;