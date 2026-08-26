// src/api/routes/quotes.routes.js
import { Router } from 'express';
import { 
  getQuotes,
  getQuoteDetails,
  createQuote,
  updateQuote,
  deleteQuote,
  createRevision,
  updateRevision,
  deleteRevision,
  createLineItem,
  updateLineItem,
  deleteLineItem
} from './quotes.controller.js';
import { requireAuth, requireRole } from '../../middleware/authMiddleware.js';

const router = Router();

// Apply Authentication to all quote routes
router.use(requireAuth);
// Restrict access strictly to Commercial team and Admins
router.use(requireRole(['full', 'commercial']));

// 1. Quote Core Routes
router.get('/', getQuotes);
router.post('/', createQuote);
router.get('/:id', getQuoteDetails);
router.put('/:id', updateQuote);
router.delete('/:id', deleteQuote);

// 2. Revisions & Line Items
router.post('/:id/revisions', createRevision);
router.put('/revisions/:revisionId', updateRevision);
router.delete('/revisions/:revisionId', deleteRevision);

router.post('/revisions/:revisionId/lines', createLineItem);
router.put('/lines/:lineId', updateLineItem);
router.delete('/lines/:lineId', deleteLineItem);

export default router;