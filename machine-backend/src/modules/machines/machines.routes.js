import { Router } from 'express';
import { getCompanyMachines, getMachineById, updateMachineStatus } from './machines.controller.js';
import { requireAuth, requireRole } from '../../middleware/authMiddleware.js';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole(['full', 'technician', 'commercial']), getCompanyMachines);
router.get('/:id', requireRole(['full', 'technician', 'commercial']), getMachineById);

// ONLY Admins can force-update the status
router.patch('/:id/status', requireRole(['full']), updateMachineStatus);

export default router;