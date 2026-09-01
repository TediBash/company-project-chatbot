import xlsx from 'xlsx';
import { query } from './src/config/db.js';

// 1. Machine ID to UUID Mapping
const machineIdMap = {
  'MCH-0001': '74026f28-7a38-412b-95ba-eb1159e99d38',
  'MCH-0002': '3870f767-4f12-4d3f-9982-cf9aeaa2c969',
  'MCH-0003': 'e2ac328a-fe43-422a-b6e4-c12bee02d6f3',
  'MCH-0004': '837ee5d7-b152-4150-bb80-8b601b48abf3',
  'MCH-0005': 'e717b57c-62cf-4d41-9804-f9ef8bf0f8a4',
  'MCH-0006': '5ed4ced2-1e70-4549-a5a2-8047fa5c30b2',
  'MCH-0007': '4cc8bd7a-b4f0-418e-adef-a04cec035dd9',
  'MCH-0008': '320a8053-2555-4d6b-8139-f57afa13a342'
};

// 2. Helper to parse European number formats (e.g. "91,6" -> 91.6)
const parseNumber = (val) => {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') {
    return parseFloat(val.replace(',', '.'));
  }
  return val;
};

const loadTelemetryData = async (filePath) => {
  try {
    console.log(`Reading Excel file: ${filePath}`);
    const workbook = xlsx.readFile(filePath);
    
    if (!workbook.Sheets['TelemetrySnapshots']) {
      throw new Error('Sheet "TelemetrySnapshots" not found in the Excel file.');
    }

    // Convert the sheet into an array of JSON objects
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets['TelemetrySnapshots']);
    console.log(`Found ${rows.length} rows to insert. Processing...`);

    const insertQuery = `
      INSERT INTO app_operational.telemetry_snapshots 
      (machine_id, timestamp, operational_status, production_rate_bph, uptime_percentage, alarm_count, temperature_c, energy_kwh, health_note)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    // Process sequentially to safely execute all DB queries[cite: 8]
    for (const row of rows) {
      const mappedMachineId = machineIdMap[row.machineId];
      
      if (!mappedMachineId) {
        console.warn(`Warning: Machine ID ${row.machineId} not found in map. Skipping row.`);
        continue;
      }

      const values = [
        mappedMachineId,
        row.timestamp,
        row.operationalStatus,
        parseNumber(row.productionRateBph),
        parseNumber(row.uptimePercentage),
        parseNumber(row.alarmCount),
        parseNumber(row.temperatureC),
        parseNumber(row.energyKwh),
        row.healthNote || null // Handles empty notes safely
      ];

      await query(insertQuery, values);
    }

    console.log('✅ Success! All telemetry data has been loaded.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error loading data:', error);
    process.exit(1);
  }
};

// Execute the script (Update this path to point to your actual .xlsx file)
loadTelemetryData('./AROL_Q2_synthetic_fleet_dataset.xlsx');