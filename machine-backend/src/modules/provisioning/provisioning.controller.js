// src/modules/provisioning/provisioning.controller.js
import { query } from '../../config/db.js';

// GET /api/provisioning
export const getProvisionedMachines = async (req, res) => {
  const { search, companyId, modelId, page = 1, limit = 25 } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = `WHERE 1=1`;
  const params = [];
  let paramIndex = 1;

  // 1. Build Dynamic Filters
  if (search) {
    whereClause += ` AND (m.serial_number ILIKE $${paramIndex} OR m.plant_location ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }
  if (companyId) {
    whereClause += ` AND m.company_id = $${paramIndex}`;
    params.push(companyId);
    paramIndex++;
  }
  if (modelId) {
    whereClause += ` AND m.model_id = $${paramIndex}`;
    params.push(modelId);
    paramIndex++;
  }

  try {
    // 2. Aggregate Stats & Total Count Query (Unaffected by LIMIT)
    const statsSql = `
      SELECT 
        COUNT(m.machine_id) AS total_machines,
        COUNT(DISTINCT m.company_id) AS total_companies,
        COUNT(m.machine_id) FILTER (WHERE ts.operational_status = 'Running') AS total_active
      FROM app_tenant.machines m
      LEFT JOIN LATERAL (
        SELECT operational_status FROM app_operational.telemetry_snapshots
        WHERE machine_id = m.machine_id
        ORDER BY timestamp DESC
        LIMIT 1
      ) ts ON true
      ${whereClause}
    `;
    const statsRes = await query(statsSql, params);
    const stats = statsRes.rows[0];

    // 3. Paginated Data Query (With LIMIT and OFFSET)
    // ADDED: m.configuration_profile AS "configurationProfile"
    const dataSql = `
      SELECT 
        m.machine_id AS "id",
        m.serial_number AS "serialNumber",
        m.plant_location AS "plantLocation",
        TO_CHAR(m.delivery_date, 'YYYY-MM-DD') AS "deliveryDate",
        m.plc_family AS "plcFamily",
        m.software_version AS "softwareVersion",
        m.configuration_profile AS "configurationProfile",
        c.company_id AS "companyId",
        c.company_name AS "companyName",
        mm.model_id AS "modelId",
        mm.model_code AS "modelCode",
        COALESCE(ts.operational_status, 'Stopped') AS "status"
      FROM app_tenant.machines m
      JOIN app_tenant.companies c ON m.company_id = c.company_id
      JOIN app_tenant.machine_models mm ON m.model_id = mm.model_id
      LEFT JOIN LATERAL (
        SELECT operational_status FROM app_operational.telemetry_snapshots
        WHERE machine_id = m.machine_id
        ORDER BY timestamp DESC
        LIMIT 1
      ) ts ON true
      ${whereClause}
      ORDER BY m.delivery_date DESC, m.serial_number ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const dataParams = [...params, limit, offset];
    const dataRes = await query(dataSql, dataParams);

    // 4. Return Structured Payload
    res.json({
      data: dataRes.rows,
      stats: {
        totalMachines: parseInt(stats.total_machines) || 0,
        totalCompanies: parseInt(stats.total_companies) || 0,
        totalActive: parseInt(stats.total_active) || 0
      },
      pagination: {
        total: parseInt(stats.total_machines) || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil((parseInt(stats.total_machines) || 0) / limit)
      }
    });
  } catch (error) {
    console.error('[Provisioning GET Error]', error);
    res.status(500).json({ message: 'Failed to fetch provisioned machines.' });
  }
};

// GET /api/provisioning/options (Dropdown data for the frontend)
export const getProvisioningOptions = async (req, res) => {
  try {
    const companies = await query(`SELECT company_id AS "id", company_name AS "name" FROM app_tenant.companies ORDER BY company_name ASC`);
    const models = await query(`SELECT model_id AS "id", model_code AS "code" FROM app_tenant.machine_models WHERE is_active = true ORDER BY model_code ASC`);
    
    res.json({
      companies: companies.rows,
      models: models.rows
    });
  } catch (error) {
    console.error('[Options GET Error]', error);
    res.status(500).json({ message: 'Failed to fetch mapping options.' });
  }
};

// POST /api/provisioning
export const createProvisionedMachine = async (req, res) => {
  // EXTRACTED: configurationProfile from req.body
  const { companyId, modelId, serialNumber, plantLocation, deliveryDate, plcFamily, softwareVersion, configurationProfile } = req.body;
  try {
    // Stringify the incoming JSON or default to an empty JSON object string if null
    const configJson = configurationProfile ? JSON.stringify(configurationProfile) : '{}';

    const sql = `
      INSERT INTO app_tenant.machines 
        (machine_id, company_id, model_id, serial_number, plant_location, delivery_date, plc_family, software_version, configuration_profile)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
    `;
    await query(sql, [companyId, modelId, serialNumber, plantLocation, deliveryDate, plcFamily, softwareVersion, configJson]);
    res.status(201).json({ message: 'Machine deployed successfully.' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'This Serial Number is already registered for this specific Company.' });
    console.error('[Machine CREATE Error]', error);
    res.status(500).json({ message: 'Failed to deploy machine.' });
  }
};

// PUT /api/provisioning/:id
export const updateProvisionedMachine = async (req, res) => {
  const { id } = req.params;
  // EXTRACTED: configurationProfile from req.body
  const { companyId, modelId, serialNumber, plantLocation, deliveryDate, plcFamily, softwareVersion, configurationProfile } = req.body;
  try {
    // Stringify the incoming JSON or default to an empty JSON object string if null
    const configJson = configurationProfile ? JSON.stringify(configurationProfile) : '{}';

    const sql = `
      UPDATE app_tenant.machines 
      SET company_id = $1, model_id = $2, serial_number = $3, plant_location = $4, 
          delivery_date = $5, plc_family = $6, software_version = $7, configuration_profile = $8
      WHERE machine_id = $9
    `;
    await query(sql, [companyId, modelId, serialNumber, plantLocation, deliveryDate, plcFamily, softwareVersion, configJson, id]);
    res.json({ message: 'Machine configuration updated.' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'This Serial Number is already registered for this specific Company.' });
    console.error('[Machine UPDATE Error]', error);
    res.status(500).json({ message: 'Failed to update machine.' });
  }
};

// DELETE /api/provisioning/:id
export const deleteProvisionedMachine = async (req, res) => {
  const { id } = req.params;
  try {
    await query(`DELETE FROM app_tenant.machines WHERE machine_id = $1`, [id]);
    res.json({ message: 'Machine unmapped and deleted.' });
  } catch (error) {
    console.error('[Machine DELETE Error]', error);
    res.status(500).json({ message: 'Failed to delete machine.' });
  }
};