// src/modules/provisioning/provisioning.routes.js
import { Router } from 'express';
import { 
  getProvisionedMachines, 
  getProvisioningOptions, 
  createProvisionedMachine, 
  updateProvisionedMachine, 
  deleteProvisionedMachine 
} from './provisioning.controller.js';
import { requireAuth, requirePlatformOwner } from '../../middleware/authMiddleware.js';

const router = Router();

router.use(requireAuth);
router.use(requirePlatformOwner);

router.get('/', getProvisionedMachines);
router.get('/options', getProvisioningOptions); // Must go BEFORE /:id
router.post('/', createProvisionedMachine);
router.put('/:id', updateProvisionedMachine);
router.delete('/:id', deleteProvisionedMachine);

export default router;