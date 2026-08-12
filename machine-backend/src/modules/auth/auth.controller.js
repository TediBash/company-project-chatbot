// src/modules/auth/auth.controller.js
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../../config/db.js';

export const login = async (req, res) => {
  let { email, password, tenantSlug } = req.body;

  try {
    if (tenantSlug === 'arol' && email.includes('@')) {
      const domain = email.split('@')[1];
      const derivedSlug = domain.split('.')[0];
      if (derivedSlug !== 'arol') tenantSlug = derivedSlug;
    }

    // 1. Resolve full Tenant payload
    const companyRes = await query(
      `SELECT company_id, company_name, subdomain_slug, primary_color, secondary_color, logo_url, is_platform_owner 
       FROM app_tenant.companies WHERE subdomain_slug = $1`,
      [tenantSlug]
    );

    if (companyRes.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found.' });
    }
    const company = companyRes.rows[0];

    // 2. Find User
    const userRes = await query(
      `SELECT user_id, password_hash, visibility, first_name, last_name 
       FROM app_tenant.users WHERE email = $1 AND company_id = $2`,
      [email, company.company_id]
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

    // 4. Generate JWT with Embedded Secure Payload
    const token = jwt.sign(
      { 
        user: {
          id: user.user_id,
          firstName: user.first_name,
          lastName: user.last_name,
          visibility: user.visibility
        },
        tenant: {
          companyId: company.company_id,
          companyName: company.company_name,
          subdomainSlug: company.subdomain_slug,
          primaryColor: company.primary_color,
          secondaryColor: company.secondary_color,
          logoUrl: company.logo_url,
          isPlatformOwner: company.is_platform_owner
        }
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Only send the token back - no extra user/tenant JSON needed
    res.json({ token });

  } catch (error) {
    console.error('[Auth Error]', error);
    res.status(500).json({ message: 'Internal server error during login.' });
  }
};