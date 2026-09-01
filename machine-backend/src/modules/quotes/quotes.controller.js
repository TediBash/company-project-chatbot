// src/api/controllers/quotes.controller.js
import { query } from '../../config/db.js';

// ==========================================
// 1. QUOTES CRUD
// ==========================================

// GET /api/quotes
export const getQuotes = async (req, res) => {
  const { search, machineId, status, page = 1, limit = 25, companyId } = req.query;
  const offset = (page - 1) * limit;

  try {
    let whereClause = `WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    // Tenant Isolation Logic
    if (!req.tenant.isPlatformOwner) {
      // Standard users ONLY see their own company
      whereClause += ` AND company_id = $${paramIndex}`;
      params.push(req.tenant.companyId);
      paramIndex++;
    } else if (companyId) {
      // Platform owners can filter by a specific client
      whereClause += ` AND company_id = $${paramIndex}`;
      params.push(companyId);
      paramIndex++;
    }
    // If Platform Owner AND no companyId provided, skip the filter to show ALL quotes

    // Apply Search Filter (searching within the description)
    if (search) {
      whereClause += ` AND description ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (machineId) {
      whereClause += ` AND EXISTS(SELECT 1 FROM app_commercial.quote_revisions qr JOIN app_commercial.quote_lines ql ON qr.revision_id = ql.quote_revision_id WHERE qr.quote_id = q.quote_id AND ql.machine_id = $${paramIndex})`;
      params.push(machineId);
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND EXISTS(SELECT 1 FROM app_commercial.quote_revisions qr WHERE qr.quote_id = q.quote_id AND qr.revision_status = $${paramIndex})`;
      params.push(status);
      paramIndex++;
    }

    if (req.query.validity === 'active') {
      whereClause += ` AND valid_until >= CURRENT_DATE`;
    } else if (req.query.validity === 'expired') {
      whereClause += ` AND valid_until < CURRENT_DATE`;
    }

    // 1. Get Total Count for Pagination Metadata
    const countSql = `SELECT COUNT(quote_id) AS total FROM app_commercial.quotes q ${whereClause}`;
    const countRes = await query(countSql, params);
    const totalRecords = parseInt(countRes.rows[0].total) || 0;

    // 2. Fetch Paginated Data
    const dataSql = `
      SELECT 
        q.quote_id AS "id", 
        q.company_id AS "companyId", 
        q.currency, 
        q.created_at AS "createdAt", 
        q.valid_until AS "validUntil", 
        q.description,
        EXISTS (
          SELECT 1 
          FROM app_commercial.quote_revisions qr
          JOIN app_commercial.orders o ON qr.revision_id = o.quote_revision_id
          WHERE qr.quote_id = q.quote_id 
            AND qr.revision_status = 'Approved'
        ) AS "hasOrder"
      FROM app_commercial.quotes q
      ${whereClause} 
      ORDER BY q.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    // Add limit and offset to the query parameters
    const dataParams = [...params, limit, offset];
    const { rows } = await query(dataSql, dataParams);

    // 3. Return Data with Pagination wrapper
    res.json({
      data: rows,
      pagination: {
        total: totalRecords,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalRecords / limit)
      }
    });
  } catch (error) {
    console.error('[GET Quotes Error]', error);
    res.status(500).json({ message: 'Failed to fetch quotes.' });
  }
};

// GET /api/quotes/:id
export const getQuoteDetails = async (req, res) => {
  const { id } = req.params;
  const companyId = req.tenant.companyId;
  const isPlatformOwner = req.tenant.isPlatformOwner;

  try {
    // 1. Fetch Quote (Bypass company_id strict check for Platform Owners)
    const quoteSql = isPlatformOwner 
      ? `
        SELECT quote_id AS "id", company_id AS "companyId", currency, created_at AS "createdAt", 
               valid_until AS "validUntil", description 
        FROM app_commercial.quotes 
        WHERE quote_id = $1
      `
      : `
        SELECT quote_id AS "id", company_id AS "companyId", currency, created_at AS "createdAt", 
               valid_until AS "validUntil", description 
        FROM app_commercial.quotes 
        WHERE quote_id = $1 AND company_id = $2
      `;
      
    const params = isPlatformOwner ? [id] : [id, companyId];
    const quoteRes = await query(quoteSql, params);
    
    if (quoteRes.rows.length === 0) return res.status(404).json({ message: 'Quote not found or access denied.' });

    // 2. Fetch Revisions
    const revSql = `
      SELECT revision_id AS "id", revision_number AS "revisionNumber", 
             revision_status AS "revisionStatus", created_at AS "issuedAt", 
             discount_rate AS "discountRate", change_summary AS "changeSummary"
      FROM app_commercial.quote_revisions 
      WHERE quote_id = $1 
      ORDER BY revision_number DESC
    `;
    const revRes = await query(revSql, [id]);

    // 3. Fetch Lines for all revisions (to map them in the frontend)
    const linesSql = `
      SELECT 
        ql.line_id AS "id", 
        ql.quote_revision_id AS "revisionId", 
        ql.machine_id AS "machineId", 
        ql.price, 
        ql.item_description, 
        mm.model_code AS "machineName"
      FROM app_commercial.quote_lines ql
      LEFT JOIN app_tenant.machines m ON ql.machine_id = m.machine_id
      LEFT JOIN app_tenant.machine_models mm ON m.model_id = mm.model_id
      WHERE ql.quote_revision_id IN (
        SELECT revision_id 
        FROM app_commercial.quote_revisions 
        WHERE quote_id = $1
      )
    `;
    const linesRes = await query(linesSql, [id]);

    res.json({
      ...quoteRes.rows[0],
      revisions: revRes.rows.map(rev => ({
        ...rev,
        lines: linesRes.rows.filter(line => line.revisionId === rev.id)
      }))
    });
  } catch (error) {
    console.error('[GET Quote Details Error]', error);
    res.status(500).json({ message: 'Failed to fetch quote details.' });
  }
};


// POST /api/quotes
export const createQuote = async (req, res) => {
  const { companyId, currency, validUntil, description } = req.body;
  
  if (!companyId) return res.status(400).json({ message: 'Company ID is required.' });

  try {
    const sql = `
      INSERT INTO app_commercial.quotes (company_id, currency, valid_until, description)
      VALUES ($1, $2, $3, $4)
      RETURNING quote_id AS "id", currency, created_at AS "createdAt", valid_until AS "validUntil", description
    `;
    const { rows } = await query(sql, [companyId, currency, validUntil, description]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('[CREATE Quote Error]', error);
    res.status(500).json({ message: 'Failed to create quote.' });
  }
};

// PUT /api/quotes/:id
export const updateQuote = async (req, res) => {
  const { id } = req.params;
  const { currency, validUntil, description } = req.body;

  try {
    const sql = `
      UPDATE app_commercial.quotes 
      SET currency = $1, valid_until = $2, description = $3
      WHERE quote_id = $4
      RETURNING quote_id AS "id"
    `;
    const { rows } = await query(sql, [currency, validUntil, description, id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Quote not found.' });
    
    res.json({ message: 'Quote updated successfully.' });
  } catch (error) {
    console.error('[UPDATE Quote Error]', error);
    res.status(500).json({ message: 'Failed to update quote.' });
  }
};

// DELETE /api/quotes/:id
export const deleteQuote = async (req, res) => {
  const { id } = req.params;

  try {
    const sql = `DELETE FROM app_commercial.quotes WHERE quote_id = $1 RETURNING quote_id`;
    const { rows } = await query(sql, [id]);
    
    if (rows.length === 0) return res.status(404).json({ message: 'Quote not found.' });
    res.json({ message: 'Quote deleted successfully.' });
  } catch (error) {
    console.error('[DELETE Quote Error]', error);
    res.status(500).json({ message: 'Failed to delete quote.' });
  }
};


// ==========================================
// 2. REVISIONS & LINES (Nested Actions)
// ==========================================

// POST /api/quotes/:id/revisions
export const createRevision = async (req, res) => {
  const { id: quoteId } = req.params;
  const { revisionNumber, revisionStatus, discountRate, changeSummary } = req.body;

  try {
    const sql = `
      INSERT INTO app_commercial.quote_revisions (quote_id, revision_number, revision_status, discount_rate, change_summary)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING revision_id AS "id"
    `;
    const { rows } = await query(sql, [quoteId, revisionNumber, revisionStatus, discountRate, changeSummary]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('[CREATE Revision Error]', error);
    res.status(500).json({ message: 'Failed to create revision.' });
  }
};

// PUT /api/quotes/revisions/:revisionId
export const updateRevision = async (req, res) => {
  const { revisionId } = req.params;
  const { revisionNumber, revisionStatus, discountRate, changeSummary } = req.body;

  try {
    const sql = `
      UPDATE app_commercial.quote_revisions
      SET revision_number = $1, revision_status = $2, discount_rate = $3, change_summary = $4
      WHERE revision_id = $5 
      RETURNING revision_id AS "id", revision_status AS "revisionStatus"
    `;
    
    const { rows } = await query(sql, [revisionNumber, revisionStatus, discountRate, changeSummary, revisionId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Revision not found.' });
    }
    
    res.json({ message: 'Revision updated successfully.', data: rows[0] });
  } catch (error) {
    console.error('[UPDATE Revision Error]', error);
    res.status(500).json({ message: 'Failed to update revision.' });
  }
};

// DELETE /api/quotes/revisions/:revisionId
export const deleteRevision = async (req, res) => {
  const { revisionId } = req.params;

  try {
    const sql = `DELETE FROM app_commercial.quote_revisions WHERE revision_id = $1 RETURNING revision_id`;
    const { rows } = await query(sql, [revisionId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Revision not found.' });
    }
    
    res.json({ message: 'Revision deleted successfully.' });
  } catch (error) {
    console.error('[DELETE Revision Error]', error);
    res.status(500).json({ message: 'Failed to delete revision.' });
  }
};

// POST /api/quotes/revisions/:revisionId/lines
export const createLineItem = async (req, res) => {
  const { revisionId } = req.params;
  // Now extracting the new fields from Python payload
  const { modelCode, serialNumber, price, description, machineId } = req.body;

  try {
    let targetMachineId = machineId || null;

    // ---> NEW: Dynamically resolve the machine_id <---
    if (!targetMachineId && modelCode && serialNumber) {
      const machineLookup = await query(`
        SELECT m.machine_id 
        FROM app_tenant.machines m
        JOIN app_tenant.machine_models mm ON m.model_id = mm.model_id
        WHERE mm.model_code = $1 AND m.serial_number = $2
      `, [modelCode, serialNumber]);
      
      if (machineLookup.rows.length > 0) {
        targetMachineId = machineLookup.rows[0].machine_id;
      } else {
        console.warn(`[Line Item] Machine ${modelCode} (SN: ${serialNumber}) not found. Resolving as General Supply.`);
      }
    }

    const sql = `
      INSERT INTO app_commercial.quote_lines (quote_revision_id, machine_id, price, item_description)
      VALUES ($1, $2, $3, $4)
      RETURNING line_id AS "id"
    `;
    const { rows } = await query(sql, [revisionId, targetMachineId, price, description]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('[CREATE Line Error]', error);
    res.status(500).json({ message: 'Failed to add line item.' });
  }
};

// PUT /api/quotes/lines/:lineId
export const updateLineItem = async (req, res) => {
  const { lineId } = req.params;
  const { machineId, price, description } = req.body;

  try {
    const sql = `
      UPDATE app_commercial.quote_lines
      SET machine_id = $1, price = $2, item_description = $3
      WHERE line_id = $4 
      RETURNING line_id AS "id", machine_id AS "machineId", price, item_description
    `;
    
    const { rows } = await query(sql, [machineId || null, price, description, lineId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Quote line not found.' });
    }
    
    res.json({ message: 'Quote line updated successfully.', data: rows[0] });
  } catch (error) {
    console.error('[UPDATE Quote Line Error]', error);
    res.status(500).json({ message: 'Failed to update quote line.' });
  }
};

// DELETE /api/quotes/lines/:lineId
export const deleteLineItem = async (req, res) => {
  const { lineId } = req.params;

  try {
    const sql = `DELETE FROM app_commercial.quote_lines WHERE line_id = $1 RETURNING line_id`;
    const { rows } = await query(sql, [lineId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Quote line not found.' });
    }
    
    res.json({ message: 'Quote line deleted successfully.' });
  } catch (error) {
    console.error('[DELETE Quote Line Error]', error);
    res.status(500).json({ message: 'Failed to delete quote line.' });
  }
};