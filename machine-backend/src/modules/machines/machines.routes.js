import { Router } from 'express';
import { getCompanyMachines, getMachineById, updateMachineStatus, getMachineTelemetry, getMachineAlarms, getMachineMaintenance } from './machines.controller.js';
import { requireAuth, requireRole } from '../../middleware/authMiddleware.js';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole(['full', 'technician', 'commercial']), getCompanyMachines);
router.get('/:id', requireRole(['full', 'technician', 'commercial']), getMachineById);

// ONLY Admins can force-update the status
router.patch('/:id/status', requireRole(['full']), updateMachineStatus);

router.get('/:id/telemetry', requireRole(['full', 'technician']), getMachineTelemetry);
router.get('/:id/alarms', requireRole(['full', 'technician']), getMachineAlarms);
router.get('/:id/maintenance', requireRole(['full', 'technician']), getMachineMaintenance);

export default router;