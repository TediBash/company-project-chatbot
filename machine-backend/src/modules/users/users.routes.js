import { Router } from 'express';
import { getUsers, createUser, updateUser, deleteUser } from './users.controller.js';
import { requireAuth, requireRole } from '../../middleware/authMiddleware.js';

const router = Router();

// Apply authentication and strict RBAC to the entire router
router.use(requireAuth);
router.use(requireRole(['full']));

// Route definitions
router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;