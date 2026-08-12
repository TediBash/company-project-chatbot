// src/modules/users/users.controller.js
import bcrypt from 'bcrypt';
import { query } from '../../config/db.js';

export const getUsers = async (req, res) => {
  const companyId = req.tenant.companyId;
  const { firstName, lastName, jobTitle, visibility } = req.query;

  try {
    let sql = `
      SELECT user_id AS "id", first_name AS "firstName", last_name AS "lastName", 
             email, job_title AS "jobTitle", visibility 
      FROM app_tenant.users 
      WHERE company_id = $1
    `;
    const params = [companyId];
    let paramIndex = 2;

    if (firstName) {
      sql += ` AND first_name ILIKE $${paramIndex++}`;
      params.push(`%${firstName}%`);
    }
    if (lastName) {
      sql += ` AND last_name ILIKE $${paramIndex++}`;
      params.push(`%${lastName}%`);
    }
    if (jobTitle) {
      sql += ` AND job_title ILIKE $${paramIndex++}`;
      params.push(`%${jobTitle}%`);
    }
    if (visibility) {
      sql += ` AND visibility = $${paramIndex++}`;
      params.push(visibility);
    }

    sql += ` ORDER BY first_name ASC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('[Users GET Error]', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

// NEW: Create User functionality
export const createUser = async (req, res) => {
  const companyId = req.tenant.companyId; 
  const { firstName, lastName, email, password, jobTitle, visibility } = req.body;

  try {
    // 1. Hash the temporary password before saving to the DB
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const sql = `
      INSERT INTO app_tenant.users 
        (company_id, first_name, last_name, email, password_hash, job_title, visibility)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING user_id;
    `;
    
    await query(sql, [
      companyId, firstName, lastName, email, passwordHash, jobTitle, visibility
    ]);

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('[Users CREATE Error]', error);
    // PostgreSQL error code '23505' is a unique_violation (e.g., email already exists)
    if (error.code === '23505') {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }
    res.status(500).json({ message: 'Failed to create user' });
  }
};

// UPDATED: Handle optional password changes
export const updateUser = async (req, res) => {
  const { id } = req.params;
  const companyId = req.tenant.companyId;
  const { firstName, lastName, jobTitle, visibility, password } = req.body;

  try {
    if (password) {
      // If the admin provided a new password, hash it and update it
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      const sql = `
        UPDATE app_tenant.users 
        SET first_name = $1, last_name = $2, job_title = $3, visibility = $4, password_hash = $5
        WHERE user_id = $6 AND company_id = $7
      `;
      await query(sql, [firstName, lastName, jobTitle, visibility, passwordHash, id, companyId]);
    } else {
      // If no password was provided, only update the profile fields
      const sql = `
        UPDATE app_tenant.users 
        SET first_name = $1, last_name = $2, job_title = $3, visibility = $4 
        WHERE user_id = $5 AND company_id = $6
      `;
      await query(sql, [firstName, lastName, jobTitle, visibility, id, companyId]);
    }

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('[Users UPDATE Error]', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;
  const companyId = req.tenant.companyId;

  try {
    const sql = `DELETE FROM app_tenant.users WHERE user_id = $1 AND company_id = $2`;
    await query(sql, [id, companyId]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('[Users DELETE Error]', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
};