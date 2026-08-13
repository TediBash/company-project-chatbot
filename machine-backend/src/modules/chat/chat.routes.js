import { Router } from 'express';
import { 
  getSessions, 
  getSessionDetails, 
  streamMessage, 
  confirmAction,
  createSession,
  deleteSession,
  updateSessionTitle
} from './chat.controller.js';
import { requireAuth, requireRole } from '../../middleware/authMiddleware.js';

const router = Router();
router.use(requireAuth);

router.get('/sessions', getSessions);
router.post('/sessions', createSession);
router.get('/sessions/:id', getSessionDetails);
router.delete('/sessions/:id', deleteSession);
router.put('/sessions/:id/title', updateSessionTitle);

router.post('/sessions/:id/stream', streamMessage);
router.post('/sessions/:id/action', confirmAction);

export default router;