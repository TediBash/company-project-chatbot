import { Router } from 'express';
import { getCompanies, createCompany, updateCompany, deleteCompany } from './companies.controller.js';
import { requireAuth, requirePlatformOwner } from '../../middleware/authMiddleware.js';

const router = Router();

// 1. Verify standard JWT token
router.use(requireAuth);

// 2. Verify AROL Super Admin privileges
router.use(requirePlatformOwner);

// 3. Map Routes
router.get('/', getCompanies);
router.post('/', createCompany);
router.put('/:id', updateCompany);
router.delete('/:id', deleteCompany);

export default router;