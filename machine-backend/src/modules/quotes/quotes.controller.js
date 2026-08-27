// src/api/controllers/quotes.controller.js
import { query } from '../../config/db.js';

// ==========================================
// 1. QUOTES CRUD
// ==========================================

// GET /api/quotes
export const getQuotes = async (req, res) => {
  const { search, machineId, status, page = 1, limit = 25 } = req.query;
  const offset = (page - 1) * limit;

  // Enforce Tenant Isolation
  const companyId = req.tenant.isPlatformOwner && req.query.companyId 
    ? req.query.companyId 
    : req.tenant.companyId;

  try {
    let whereClause = `WHERE company_id = $1`;
    const params = [companyId];
    let paramIndex = 2;

    // Apply Search Filter (searching within the description)
    if (search) {
      whereClause += ` AND description ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (machineId) {
      // Requires a JOIN or EXISTS subquery to check quote_lines
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

  try {
    // 1. Fetch Quote
    const quoteSql = `
      SELECT quote_id AS "id", currency, created_at AS "createdAt", 
             valid_until AS "validUntil", description 
      FROM app_commercial.quotes 
      WHERE quote_id = $1 AND company_id = $2
    `;
    const quoteRes = await query(quoteSql, [id, companyId]);
    if (quoteRes.rows.length === 0) return res.status(404).json({ message: 'Quote not found.' });

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
  const { currency, validUntil, description } = req.body;
  const companyId = req.tenant.companyId;

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
  const companyId = req.tenant.companyId;

  try {
    const sql = `
      UPDATE app_commercial.quotes 
      SET currency = $1, valid_until = $2, description = $3
      WHERE quote_id = $4 AND company_id = $5
      RETURNING quote_id AS "id"
    `;
    const { rows } = await query(sql, [currency, validUntil, description, id, companyId]);
    if (rows.length === 0) return res.status(404).json({ message: 'Quote not found or access denied.' });
    
    res.json({ message: 'Quote updated successfully.' });
  } catch (error) {
    console.error('[UPDATE Quote Error]', error);
    res.status(500).json({ message: 'Failed to update quote.' });
  }
};

// DELETE /api/quotes/:id
export const deleteQuote = async (req, res) => {
  const { id } = req.params;
  const companyId = req.tenant.companyId;

  try {
    const sql = `DELETE FROM app_commercial.quotes WHERE quote_id = $1 AND company_id = $2 RETURNING quote_id`;
    const { rows } = await query(sql, [id, companyId]);
    
    if (rows.length === 0) return res.status(404).json({ message: 'Quote not found or access denied.' });
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
  const companyId = req.tenant.companyId;

  try {
    // Security check: ensure quote belongs to tenant
    const checkRes = await query(`SELECT quote_id FROM app_commercial.quotes WHERE quote_id = $1 AND company_id = $2`, [quoteId, companyId]);
    if (checkRes.rows.length === 0) return res.status(404).json({ message: 'Quote not found.' });

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
  const companyId = req.tenant.companyId;

  try {
    // Security check: Join with quotes to verify tenant ownership
    const sql = `
      UPDATE app_commercial.quote_revisions qr
      SET revision_number = $1, revision_status = $2, discount_rate = $3, change_summary = $4
      FROM app_commercial.quotes q
      WHERE qr.quote_id = q.quote_id 
        AND qr.revision_id = $5 
        AND q.company_id = $6
      RETURNING qr.revision_id AS "id", qr.revision_status AS "revisionStatus"
    `;
    
    const { rows } = await query(sql, [revisionNumber, revisionStatus, discountRate, changeSummary, revisionId, companyId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Revision not found or access denied.' });
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
  const companyId = req.tenant.companyId;

  try {
    // Security check: Join with quotes to verify tenant ownership
    const sql = `
      DELETE FROM app_commercial.quote_revisions qr
      USING app_commercial.quotes q
      WHERE qr.quote_id = q.quote_id
        AND qr.revision_id = $1 
        AND q.company_id = $2
      RETURNING qr.revision_id
    `;
    
    const { rows } = await query(sql, [revisionId, companyId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Revision not found or access denied.' });
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
  const { machineId, price, description } = req.body;
  console.log('[DEBUG] createLineItem (req.body):', JSON.stringify(req.body, null, 2));
  console.log('[DEBUG] revisionId:', revisionId);

  try {
    const sql = `
      INSERT INTO app_commercial.quote_lines (quote_revision_id, machine_id, price, item_description)
      VALUES ($1, $2, $3, $4)
      RETURNING line_id AS "id"
    `;
    const { rows } = await query(sql, [revisionId, machineId, price, description]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('[CREATE Line Error]', error);
    res.status(500).json({ message: 'Failed to add line item.' });
  }
};

// ==========================================
// 3. QUOTE LINES CRUD (Expanded)
// ==========================================

// PUT /api/quotes/lines/:lineId
export const updateLineItem = async (req, res) => {
  const { lineId } = req.params;
  const { machineId, price, description } = req.body;
  const companyId = req.tenant.companyId;

  try {
    // Security check: Join through revisions and quotes to verify tenant ownership
    const sql = `
      UPDATE app_commercial.quote_lines ql
      SET machine_id = $1, price = $2, item_description = $3
      FROM app_commercial.quote_revisions qr
      JOIN app_commercial.quotes q ON qr.quote_id = q.quote_id
      WHERE ql.quote_revision_id = qr.revision_id 
        AND ql.line_id = $4 
        AND q.company_id = $5
      RETURNING ql.line_id AS "id", ql.machine_id AS "machineId", ql.price, ql.item_description
    `;
    
    const { rows } = await query(sql, [machineId || null, price, description, lineId, companyId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Quote line not found or access denied.' });
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
  const companyId = req.tenant.companyId;

  try {
    // Security check: Join through revisions and quotes to verify tenant ownership
    const sql = `
      DELETE FROM app_commercial.quote_lines ql
      USING app_commercial.quote_revisions qr, app_commercial.quotes q
      WHERE ql.quote_revision_id = qr.revision_id 
        AND qr.quote_id = q.quote_id
        AND ql.line_id = $1 
        AND q.company_id = $2
      RETURNING ql.line_id
    `;
    
    const { rows } = await query(sql, [lineId, companyId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Quote line not found or access denied.' });
    }
    
    res.json({ message: 'Quote line deleted successfully.' });
  } catch (error) {
    console.error('[DELETE Quote Line Error]', error);
    res.status(500).json({ message: 'Failed to delete quote line.' });
  }
};