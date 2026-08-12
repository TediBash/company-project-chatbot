// src/modules/companies/companies.controller.js
import { query } from '../../config/db.js';
import bcrypt from 'bcrypt';

// GET /api/companies
export const getCompanies = async (req, res) => {
  const { search } = req.query;

  try {
    let sql = `
      SELECT 
        company_id AS "id", 
        company_name AS "companyName", 
        country, 
        city, 
        sector, 
        subdomain_slug AS "subdomainSlug", 
        primary_color AS "primaryColor", 
        secondary_color AS "secondaryColor",
        logo_url AS "logoUrl",
        is_platform_owner AS "isPlatformOwner"
      FROM app_tenant.companies
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (search) {
      sql += ` AND (company_name ILIKE $${paramIndex} OR subdomain_slug ILIKE $${paramIndex} OR sector ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY is_platform_owner DESC, company_name ASC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('[Companies GET Error]', error);
    res.status(500).json({ message: 'Failed to fetch companies list.' });
  }
};

// POST /api/companies
export const createCompany = async (req, res) => {
  const { companyName, country, city, sector, subdomainSlug, primaryColor, secondaryColor, logoUrl } = req.body;
  
  try {
    // 1. Insert the new Company
    const insertCompanySql = `
      INSERT INTO app_tenant.companies 
        (company_id, company_name, country, city, sector, currency, locale, subdomain_slug, primary_color, secondary_color, logo_url) 
      VALUES 
        (gen_random_uuid(), $1, $2, $3, $4, 'EUR', 'en-US', $5, $6, $7, $8)
      RETURNING company_id;
    `;
    
    const companyRes = await query(insertCompanySql, [
      companyName, country, city, sector, subdomainSlug, primaryColor, secondaryColor, logoUrl || null
    ]);
    
    const newCompanyId = companyRes.rows[0].company_id;

    // 2. Automatically provision the default Admin User
    try {
      const adminEmail = `admin@${subdomainSlug}.com`;
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash('admin123', saltRounds);

      const insertUserSql = `
        INSERT INTO app_tenant.users 
          (company_id, first_name, last_name, email, password_hash, job_title, visibility)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      
      await query(insertUserSql, [
        newCompanyId, 
        'Default', 
        'Admin', 
        adminEmail, 
        passwordHash, 
        'System Administrator', 
        'full'
      ]);
    } catch (userErr) {
      // If user creation fails, rollback the company creation to prevent orphaned data
      await query('DELETE FROM app_tenant.companies WHERE company_id = $1', [newCompanyId]);
      throw userErr;
    }

    res.status(201).json({ message: 'Company and admin account created successfully.' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'A company with this Subdomain Slug already exists.' });
    }
    console.error('[Companies CREATE Error]', error);
    res.status(500).json({ message: 'Failed to create company.' });
  }
};

// PUT /api/companies/:id
export const updateCompany = async (req, res) => {
  const { id } = req.params;
  const { companyName, country, city, sector, subdomainSlug, primaryColor, secondaryColor, logoUrl } = req.body;
  
  try {
    const sql = `
      UPDATE app_tenant.companies 
      SET company_name = $1, country = $2, city = $3, sector = $4, 
          subdomain_slug = $5, primary_color = $6, secondary_color = $7, logo_url = $8
      WHERE company_id = $9
    `;
    await query(sql, [companyName, country, city, sector, subdomainSlug, primaryColor, secondaryColor, logoUrl || null, id]);
    res.json({ message: 'Company updated successfully.' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'This Subdomain Slug is already taken by another company.' });
    }
    console.error('[Companies UPDATE Error]', error);
    res.status(500).json({ message: 'Failed to update company.' });
  }
};

// DELETE /api/companies/:id
export const deleteCompany = async (req, res) => {
  const { id } = req.params;

  try {
    const sql = `DELETE FROM app_tenant.companies WHERE company_id = $1 AND is_platform_owner = false`;
    const result = await query(sql, [id]);
    
    if (result.rowCount === 0) {
      return res.status(400).json({ message: 'Cannot delete the Platform Owner, or company not found.' });
    }
    
    res.json({ message: 'Company deleted successfully.' });
  } catch (error) {
    console.error('[Companies DELETE Error]', error);
    if (error.code === '23503') {
      return res.status(409).json({ message: 'Cannot delete this company because it still has registered users or machines.' });
    }
    res.status(500).json({ message: 'Failed to delete company.' });
  }
};