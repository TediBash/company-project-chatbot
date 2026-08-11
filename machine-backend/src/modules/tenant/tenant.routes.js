import { Router } from 'express';
import { getTenantBySlug } from './tenant.controller.js';

const router = Router();

// Public route to get branding BEFORE the user logs in
router.get('/:slug', getTenantBySlug);

export default router;