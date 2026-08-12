// src/modules/models/models.controller.js
import { query } from '../../config/db.js';

// GET /api/models
export const getModels = async (req, res) => {
  const { search } = req.query;

  try {
    let sql = `
      SELECT 
        model_id AS "id",
        model_code AS "modelCode",
        description,
        container_type AS "containerType",
        cap_type AS "capType",
        nominal_heads AS "nominalHeads",
        primitive_diameter AS "primitiveDiameter",
        is_active AS "isActive",
        manual_url AS "manualUrl"
      FROM app_tenant.machine_models
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (search) {
      sql += ` AND (model_code ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR container_type ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY model_code ASC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('[Models GET Error]', error);
    res.status(500).json({ message: 'Failed to fetch machine models.' });
  }
};

// POST /api/models
export const createModel = async (req, res) => {
  const { 
    modelCode, description, containerType, capType, 
    nominalHeads, primitiveDiameter, manualUrl 
  } = req.body;

  try {
    const sql = `
      INSERT INTO app_tenant.machine_models 
        (model_code, description, container_type, cap_type, nominal_heads, primitive_diameter, manual_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING model_id;
    `;
    
    await query(sql, [
      modelCode, description, containerType, capType, 
      nominalHeads || null, primitiveDiameter || null, manualUrl || null
    ]);

    res.status(201).json({ message: 'Machine model cataloged successfully.' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'A machine model with this code already exists.' });
    }
    console.error('[Models CREATE Error]', error);
    res.status(500).json({ message: 'Failed to create machine model.' });
  }
};

// PUT /api/models/:id
export const updateModel = async (req, res) => {
  const { id } = req.params;
  const { 
    modelCode, description, containerType, capType, 
    nominalHeads, primitiveDiameter, manualUrl 
  } = req.body;

  try {
    const sql = `
      UPDATE app_tenant.machine_models 
      SET model_code = $1, description = $2, container_type = $3, 
          cap_type = $4, nominal_heads = $5, primitive_diameter = $6, manual_url = $7
      WHERE model_id = $8
    `;
    
    await query(sql, [
      modelCode, description, containerType, capType, 
      nominalHeads || null, primitiveDiameter || null, manualUrl || null, id
    ]);

    res.json({ message: 'Machine model updated successfully.' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'A machine model with this code already exists.' });
    }
    console.error('[Models UPDATE Error]', error);
    res.status(500).json({ message: 'Failed to update machine model.' });
  }
};

// PATCH /api/models/:id/status
export const toggleModelStatus = async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  try {
    const sql = `UPDATE app_tenant.machine_models SET is_active = $1 WHERE model_id = $2`;
    await query(sql, [isActive, id]);
    res.json({ message: `Machine model ${isActive ? 'activated' : 'deactivated'} successfully.` });
  } catch (error) {
    console.error('[Models STATUS Error]', error);
    res.status(500).json({ message: 'Failed to update model status.' });
  }
};

// DELETE /api/models/:id
export const deleteModel = async (req, res) => {
  const { id } = req.params;

  try {
    const sql = `DELETE FROM app_tenant.machine_models WHERE model_id = $1`;
    await query(sql, [id]);
    res.json({ message: 'Machine model deleted successfully.' });
  } catch (error) {
    console.error('[Models DELETE Error]', error);
    // 23503 = Foreign Key Violation (can't delete if physical machines of this model exist)
    if (error.code === '23503') {
      return res.status(409).json({ message: 'Cannot delete this model because it is currently assigned to provisioned machines in the field.' });
    }
    res.status(500).json({ message: 'Failed to delete machine model.' });
  }
};