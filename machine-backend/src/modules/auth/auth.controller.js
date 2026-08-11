// src/modules/auth/auth.controller.js
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../../config/db.js';

export const login = async (req, res) => {
  let { email, password, tenantSlug } = req.body;

  try {
    // SMART ROUTING: If the default AROL screen is active, 
    // infer the target company from the email domain (e.g., @alpine-dairy.com)
    if (tenantSlug === 'arol' && email.includes('@')) {
      const domain = email.split('@')[1];
      tenantSlug = domain.split('.')[0];
    }

    // 1. Resolve Tenant
    const companyRes = await query(
      'SELECT company_id FROM app_tenant.companies WHERE subdomain_slug = $1',
      [tenantSlug]
    );

    if (companyRes.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found.' });
    }
    const companyId = companyRes.rows[0].company_id;

    // 2. Find User
    const userRes = await query(
      `SELECT user_id, password_hash, visibility, first_name, last_name 
       FROM app_tenant.users 
       WHERE email = $1 AND company_id = $2`,
      [email, companyId]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    const user = userRes.rows[0];

    // 3. Verify Password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // 4. Generate JWT
    const token = jwt.sign(
      { userId: user.user_id, companyId: companyId, visibility: user.visibility },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.user_id,
        firstName: user.first_name,
        lastName: user.last_name,
        visibility: user.visibility,
        companyId: companyId
      }
    });

  } catch (error) {
    console.error('[Auth Error]', error);
    res.status(500).json({ message: 'Internal server error during login.' });
  }
};