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
import { requireAuth, requireRole, requirePlatformOwner } from '../../middleware/authMiddleware.js';

const router = Router();

// Apply Authentication and basic Role check to ALL quote routes (allows reading)
router.use(requireAuth);
router.use(requireRole(['full', 'commercial']));

// 1. Quote Core Routes
router.get('/', getQuotes);
router.get('/:id', getQuoteDetails);

// Protected Core Mutations
router.post('/', requirePlatformOwner, createQuote);
router.put('/:id', requirePlatformOwner, updateQuote);
router.delete('/:id', requirePlatformOwner, deleteQuote);

// 2. Revisions & Line Items Mutations (Protected)
router.post('/:id/revisions', requirePlatformOwner, createRevision);
router.put('/revisions/:revisionId', requirePlatformOwner, updateRevision);
router.delete('/revisions/:revisionId', requirePlatformOwner, deleteRevision);

router.post('/revisions/:revisionId/lines', requirePlatformOwner, createLineItem);
router.put('/lines/:lineId', requirePlatformOwner, updateLineItem);
router.delete('/lines/:lineId', requirePlatformOwner, deleteLineItem);

export default router;