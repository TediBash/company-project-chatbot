import { query } from '../../config/db.js';

export const getTenantBySlug = async (req, res) => {
  try {
    let { slug } = req.params;

    // Default AROL Group Branding
    if (slug === 'localhost' || slug === '127.0.0.1' || slug === 'arol') {
      return res.json({
        companyId: 'AROL_GLOBAL',
        companyName: 'AROL Group',
        subdomainSlug: 'arol',
        primaryColor: '#dc2626', // Premium AROL Red
        secondaryColor: '#991b1b',
        logoUrl: null
      });
    }

    const sql = `
      SELECT 
        company_id AS "companyId", 
        company_name AS "companyName", 
        subdomain_slug AS "subdomainSlug", 
        primary_color AS "primaryColor", 
        secondary_color AS "secondaryColor", 
        logo_url AS "logoUrl"
      FROM app_tenant.companies
      WHERE subdomain_slug = $1;
    `;

    const { rows } = await query(sql, [slug]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found in the database.' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('[Tenant Controller Error]', error);
    res.status(500).json({ message: 'Failed to retrieve tenant branding payload.' });
  }
};