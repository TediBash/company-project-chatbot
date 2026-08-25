// src/modules/machines/machines.controller.js
import { query } from '../../config/db.js';

export const getCompanyMachines = async (req, res) => {
  const companyId = req.tenant.companyId;

  try {
    const sql = `
      SELECT 
        m.machine_id AS "id",
        m.serial_number AS "serialNumber",
        m.plant_location AS "plantLocation",
        m.delivery_date AS "deliveryDate",
        m.plc_family AS "plcFamily",
        m.software_version AS "softwareVersion",
        m.configuration_profile AS "configurationProfile",
        mm.model_code AS "modelCode",
        mm.description AS "modelDescription",
        mm.container_type AS "containerType",
        mm.cap_type AS "capType",
        mm.nominal_heads AS "nominalHeads",
        mm.primitive_diameter AS "primitiveDiameter",
        COALESCE(ts.operational_status, 'Stopped') AS "status",
        COALESCE(ts.production_rate_bph, 0) AS "productionRateBph",
        COALESCE(ts.uptime_percentage, 0) AS "uptimePercentage",
        COALESCE(ts.alarm_count, 0) AS "alarmCount",
        ts.temperature_c AS "temperatureC",
        ts.energy_kwh AS "energyKwh",
        ts.health_note AS "healthNote",
        ts.timestamp AS "lastTelemetryAt"
      FROM app_tenant.machines m
      JOIN app_tenant.machine_models mm ON m.model_id = mm.model_id
      LEFT JOIN LATERAL (
        SELECT * FROM app_operational.telemetry_snapshots
        WHERE machine_id = m.machine_id
        ORDER BY timestamp DESC
        LIMIT 1
      ) ts ON true
      WHERE m.company_id = $1
      ORDER BY m.serial_number ASC;
    `;

    const { rows } = await query(sql, [companyId]);
    res.json(rows);
  } catch (error) {
    console.error('[Machines GET Error]', error);
    res.status(500).json({ message: 'Failed to retrieve machinery fleet.' });
  }
};

export const getMachineById = async (req, res) => {
  const { id } = req.params;
  const companyId = req.tenant.companyId;

  try {
    const sql = `
      SELECT 
        m.machine_id AS "id",
        m.serial_number AS "serialNumber",
        m.plant_location AS "plantLocation",
        m.delivery_date AS "deliveryDate",
        m.plc_family AS "plcFamily",
        m.software_version AS "softwareVersion",
        m.configuration_profile AS "configurationProfile",
        mm.model_code AS "modelCode",
        mm.description AS "modelDescription",
        mm.container_type AS "containerType",
        mm.cap_type AS "capType",
        mm.nominal_heads AS "nominalHeads"
      FROM app_tenant.machines m
      JOIN app_tenant.machine_models mm ON m.model_id = mm.model_id
      WHERE m.machine_id = $1 AND m.company_id = $2;
    `;

    const { rows } = await query(sql, [id, companyId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Machine not found.' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('[Machine Detail GET Error]', error);
    res.status(500).json({ message: 'Failed to retrieve machine details.' });
  }
};

export const updateMachineStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const companyId = req.tenant.companyId;

  try {
    // 1. Ensure the machine exists and belongs to the caller's company
    const checkSql = `SELECT machine_id FROM app_tenant.machines WHERE machine_id = $1 AND company_id = $2`;
    const checkRes = await query(checkSql, [id, companyId]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ message: 'Machine not found.' });
    }

    // 2. Get the most recent telemetry to copy current physical values (BPH, etc.)
    const lastTelSql = `
      SELECT * FROM app_operational.telemetry_snapshots 
      WHERE machine_id = $1 ORDER BY timestamp DESC LIMIT 1
    `;
    const lastTelRes = await query(lastTelSql, [id]);
    
    // Fallback metrics in case this machine has zero telemetry history
    const prev = lastTelRes.rows.length > 0 ? lastTelRes.rows[0] : {
      production_rate_bph: 0, uptime_percentage: 0, alarm_count: 0, temperature_c: 25, energy_kwh: 0
    };

    // 3. Insert a new telemetry record with the Admin's forced status
    const insertSql = `
      INSERT INTO app_operational.telemetry_snapshots 
      (machine_id, timestamp, operational_status, production_rate_bph, uptime_percentage, alarm_count, temperature_c, energy_kwh, health_note)
      VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8)
    `;
    
    await query(insertSql, [
      id, 
      status, 
      prev.production_rate_bph, 
      prev.uptime_percentage, 
      prev.alarm_count, 
      prev.temperature_c, 
      prev.energy_kwh, 
      'Status manually overridden by Administrator'
    ]);

    res.json({ message: 'Machine status updated successfully' });
  } catch (error) {
    console.error('[Machine Status Update Error]', error);
    res.status(500).json({ message: 'Failed to update machine status.' });
  }
};

export const getMachineTelemetry = async (req, res) => {
  const { id } = req.params;
  const companyId = req.tenant.companyId;

  try {
    const sql = `
      SELECT 
        ts.timestamp AS "timestamp",
        ts.operational_status AS "operationalStatus",
        ts.production_rate_bph AS "productionRateBph",
        ts.uptime_percentage AS "uptimePercentage",
        ts.alarm_count AS "alarmCount",
        ts.temperature_c AS "temperatureC",
        ts.health_note AS "healthNote"
      FROM app_operational.telemetry_snapshots ts
      JOIN app_tenant.machines m ON ts.machine_id = m.machine_id
      WHERE ts.machine_id = $1 AND m.company_id = $2
      ORDER BY ts.timestamp DESC
      LIMIT 10;
    `;
    const { rows } = await query(sql, [id, companyId]);
    res.json(rows);
  } catch (error) {
    console.error('[Telemetry GET Error]', error);
    res.status(500).json({ message: 'Failed to retrieve telemetry data.' });
  }
};

export const getMachineAlarms = async (req, res) => {
  const { id } = req.params;
  const companyId = req.tenant.companyId;

  try {
    const sql = `
      SELECT 
        a.alarm_id AS "alarmId",
        a.alarm_code AS "code", 
        a.severity,
        a.timestamp,
        a.alarm_status AS "alarmStatus" 
      FROM app_operational.alarms a
      JOIN app_tenant.machines m ON a.machine_id = m.machine_id
      WHERE a.machine_id = $1 AND m.company_id = $2
      ORDER BY a.timestamp DESC
      LIMIT 10;
    `;
    const { rows } = await query(sql, [id, companyId]);
    res.json(rows);
  } catch (error) {
    console.error('[Alarms GET Error]', error);
    res.status(500).json({ message: 'Failed to retrieve alarms.' });
  }
};

export const getMachineMaintenance = async (req, res) => {
  const { id } = req.params;
  const companyId = req.tenant.companyId;

  try {
    const sql = `
      SELECT 
        mt.ticket_id AS "ticketId",
        mt.ticket_status AS "status",
        mt.ticket_type AS "description", 
        mt.created_date AS "createdAt",
        mt.priority,
        mt.owner_role AS "ownerRole",
        a.alarm_code AS "associatedAlarmCode"
      FROM app_operational.maintenance_tickets mt
      JOIN app_tenant.machines m ON mt.machine_id = m.machine_id
      LEFT JOIN app_operational.alarms a ON mt.alarm_id = a.alarm_id
      WHERE mt.machine_id = $1 AND m.company_id = $2
      ORDER BY mt.created_date DESC
      LIMIT 5;
    `;
    const { rows } = await query(sql, [id, companyId]);
    res.json(rows);
  } catch (error) {
    console.error('[Maintenance GET Error]', error);
    res.status(500).json({ message: 'Failed to retrieve maintenance tickets.' });
  }
};