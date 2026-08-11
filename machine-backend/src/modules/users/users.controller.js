import { query } from '../../config/db.js';

/**
 * Get users with dynamic filtering
 */
export const getUsers = async (req, res) => {
  try {
    const { companyId } = req.user;
    const { firstName, lastName, jobTitle, visibility } = req.query;

    let sql = `
      SELECT 
        user_id AS "id", 
        first_name AS "firstName", 
        last_name AS "lastName", 
        email, 
        job_title AS "jobTitle", 
        visibility
      FROM app_tenant.users
      WHERE company_id = $1
    `;
    
    const values = [companyId];
    let paramIndex = 2;

    // Dynamically append filters if they exist in the query parameters
    if (firstName) {
      sql += ` AND first_name ILIKE $${paramIndex}`;
      values.push(`%${firstName}%`); // ILIKE + % for case-insensitive partial match
      paramIndex++;
    }

    if (lastName) {
      sql += ` AND last_name ILIKE $${paramIndex}`;
      values.push(`%${lastName}%`);
      paramIndex++;
    }

    if (jobTitle) {
      sql += ` AND job_title ILIKE $${paramIndex}`;
      values.push(`%${jobTitle}%`);
      paramIndex++;
    }

    if (visibility) {
      sql += ` AND visibility = $${paramIndex}`;
      values.push(visibility); // Exact match for ENUM type
      paramIndex++;
    }

    sql += ` ORDER BY last_name ASC;`;
    
    const { rows } = await query(sql, values);
    
    res.json(rows);
  } catch (error) {
    console.error('[Users Controller - GET] Error:', error);
    res.status(500).json({ error: 'Failed to retrieve users.' });
  }
};

/**
 * Update an existing user
 */
export const updateUser = async (req, res) => {
  try {
    const { companyId } = req.user;
    const { id } = req.params; // User ID to modify
    const { firstName, lastName, jobTitle, visibility } = req.body;

    // Build the dynamic SET clause based on provided fields
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (firstName) {
      updates.push(`first_name = $${paramIndex++}`);
      values.push(firstName);
    }
    if (lastName) {
      updates.push(`last_name = $${paramIndex++}`);
      values.push(lastName);
    }
    if (jobTitle !== undefined) { 
      updates.push(`job_title = $${paramIndex++}`);
      values.push(jobTitle);
    }
    if (visibility) {
      updates.push(`visibility = $${paramIndex++}`);
      values.push(visibility);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update.' });
    }

    // Append the ID and companyId for the WHERE clause
    values.push(id, companyId);
    
    const sql = `
      UPDATE app_tenant.users 
      SET ${updates.join(', ')} 
      WHERE user_id = $${paramIndex++} AND company_id = $${paramIndex}
      RETURNING 
        user_id AS "id", 
        first_name AS "firstName", 
        last_name AS "lastName", 
        email, 
        job_title AS "jobTitle", 
        visibility;
    `;

    const { rows } = await query(sql, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found or access denied.' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('[Users Controller - UPDATE] Error:', error);
    res.status(500).json({ error: 'Failed to update user.' });
  }
};

/**
 * Delete a user
 */
export const deleteUser = async (req, res) => {
  try {
    const { companyId } = req.user;
    const { id } = req.params;

    const sql = `
      DELETE FROM app_tenant.users 
      WHERE user_id = $1 AND company_id = $2
      RETURNING user_id;
    `;

    const { rowCount } = await query(sql, [id, companyId]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'User not found or access denied.' });
    }

    res.status(200).json({ message: 'User successfully deleted.' });
  } catch (error) {
    console.error('[Users Controller - DELETE] Error:', error);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
};