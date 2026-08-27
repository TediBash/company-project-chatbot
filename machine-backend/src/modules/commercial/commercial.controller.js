// src/modules/commercial/commercial.controller.js
import { query } from '../../config/db.js';

// Helper to generate human-readable ticket numbers (e.g., REQ-849201)
const generateTicketNumber = () => {
  return 'REQ-' + Math.floor(100000 + Math.random() * 900000);
};

// GET /api/commercial
export const getRequests = async (req, res) => {
  const { search, companyId, status, urgency, page = 1, limit = 25 } = req.query;
  const offset = (page - 1) * limit;
  
  // Security Context extracted from the JWT Token by our auth middleware
  const isPlatformOwner = req.tenant.isPlatformOwner;
  const tenantCompanyId = req.tenant.companyId;

  let whereClause = `WHERE 1=1`;
  const params = [];
  let paramIndex = 1;

  // 1. Enforce Tenant Data Isolation
  if (!isPlatformOwner) {
    // Clients can ONLY see their own requests
    whereClause += ` AND r.company_id = $${paramIndex}`;
    params.push(tenantCompanyId);
    paramIndex++;
  } else if (companyId) {
    // AROL Admins can filter by specific companies
    whereClause += ` AND r.company_id = $${paramIndex}`;
    params.push(companyId);
    paramIndex++;
  }

  // 2. Dynamic Filters
  if (status) {
    whereClause += ` AND r.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  if (urgency) {
    whereClause += ` AND r.urgency = $${paramIndex}`;
    params.push(urgency);
    paramIndex++;
  }
  if (search) {
    whereClause += ` AND (r.ticket_number ILIKE $${paramIndex} OR r.title ILIKE $${paramIndex} OR c.company_name ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  try {
    // 3. Aggregate Stats Query
    const statsSql = `
      SELECT 
        COUNT(r.request_id) AS total_requests,
        COUNT(r.request_id) FILTER (WHERE r.status = 'Requested') AS pending_action,
        COUNT(r.request_id) FILTER (WHERE r.status IN ('Processing', 'Shipped')) AS active_orders
      FROM app_commercial.commercial_requests r
      JOIN app_tenant.companies c ON r.company_id = c.company_id
      ${whereClause}
    `;
    const statsRes = await query(statsSql, params);
    const stats = statsRes.rows[0];

    // 4. Paginated Data Query
    const dataSql = `
      SELECT 
        r.request_id AS "id",
        r.ticket_number AS "ticketNumber",
        r.title,
        r.description,
        r.type,
        r.urgency,
        r.status,
        r.quote_url AS "quoteUrl",
        r.po_url AS "poUrl",
        r.invoice_url AS "invoiceUrl",
        TO_CHAR(r.created_at, 'YYYY-MM-DD') AS "createdAt",
        c.company_id AS "companyId",
        c.company_name AS "companyName",
        m.machine_id AS "machineId",
        m.serial_number AS "serialNumber",
        u.first_name || ' ' || u.last_name AS "requesterName"
      FROM app_commercial.commercial_requests r
      JOIN app_tenant.companies c ON r.company_id = c.company_id
      LEFT JOIN app_tenant.machines m ON r.machine_id = m.machine_id
      LEFT JOIN app_tenant.users u ON r.requested_by = u.user_id
      ${whereClause}
      ORDER BY 
        CASE WHEN r.urgency = 'Critical' AND r.status NOT IN ('Invoiced', 'Cancelled') THEN 1 ELSE 2 END,
        r.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const dataParams = [...params, limit, offset];
    const dataRes = await query(dataSql, dataParams);

    // 5. Return Payload
    res.json({
      data: dataRes.rows,
      stats: {
        totalRequests: parseInt(stats.total_requests) || 0,
        pendingAction: parseInt(stats.pending_action) || 0,
        activeOrders: parseInt(stats.active_orders) || 0
      },
      pagination: {
        total: parseInt(stats.total_requests) || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil((parseInt(stats.total_requests) || 0) / limit)
      }
    });
  } catch (error) {
    console.error('[Commercial GET Error]', error);
    res.status(500).json({ message: 'Failed to fetch commercial records.' });
  }
};

// GET /api/commercial/options (Fetch companies & machines for the create form)
export const getCommercialOptions = async (req, res) => {
  const isPlatformOwner = req.tenant.isPlatformOwner;
  const tenantCompanyId = req.tenant.companyId;

  try {
    let companies = [];
    let machinesSql = `SELECT machine_id AS "id", serial_number AS "serial", plant_location AS "location" FROM app_tenant.machines`;
    let machinesParams = [];

    if (isPlatformOwner) {
      const compRes = await query(`SELECT company_id AS "id", company_name AS "name" FROM app_tenant.companies ORDER BY company_name ASC`);
      companies = compRes.rows;
      // Admins get machines dynamically on the frontend when they select a company, so we can return all or none initially.
    } else {
      // Clients only get their own machines
      machinesSql += ` WHERE company_id = $1 ORDER BY serial_number ASC`;
      machinesParams.push(tenantCompanyId);
    }

    const machinesRes = await query(machinesSql, machinesParams);

    res.json({
      companies,
      machines: machinesRes.rows
    });
  } catch (error) {
    console.error('[Options GET Error]', error);
    res.status(500).json({ message: 'Failed to fetch form options.' });
  }
};

// POST /api/commercial
export const createRequest = async (req, res) => {
  const { title, description, type, urgency, machineId, companyId } = req.body;
  const ticketNumber = generateTicketNumber();
  
  // If client, force their own company ID. If Admin, use the one from the dropdown.
  const finalCompanyId = req.tenant.isPlatformOwner ? companyId : req.tenant.companyId;
  const requestedBy = req.user.id; // From auth middleware

  try {
    const sql = `
      INSERT INTO app_commercial.commercial_requests 
        (ticket_number, company_id, machine_id, requested_by, title, description, type, urgency, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Requested')
      RETURNING request_id, ticket_number;
    `;
    
    const { rows } = await query(sql, [
      ticketNumber, finalCompanyId, machineId || null, requestedBy, title, description, type, urgency
    ]);
    
    res.status(201).json({ message: 'Request submitted successfully.', data: rows[0] });
  } catch (error) {
    console.error('[Commercial CREATE Error]', error);
    res.status(500).json({ message: 'Failed to create request.' });
  }
};

// PUT /api/commercial/:id
export const updateRequest = async (req, res) => {
  const { id } = req.params;
  const { title, description, type, urgency, status, quoteUrl, poUrl, invoiceUrl } = req.body;
  const isPlatformOwner = req.tenant.isPlatformOwner;

  try {
    // 1. Verify ownership if not platform owner
    if (!isPlatformOwner) {
      const checkRes = await query(`SELECT company_id FROM app_commercial.commercial_requests WHERE request_id = $1`, [id]);
      if (checkRes.rows.length === 0 || checkRes.rows[0].company_id !== req.tenant.companyId) {
        return res.status(403).json({ message: 'Forbidden access to this record.' });
      }
    }

    // 2. Update record
    const sql = `
      UPDATE app_commercial.commercial_requests 
      SET title = $1, description = $2, type = $3, urgency = $4, status = $5, 
          quote_url = $6, po_url = $7, invoice_url = $8, updated_at = CURRENT_TIMESTAMP
      WHERE request_id = $9
    `;
    
    await query(sql, [title, description, type, urgency, status, quoteUrl || null, poUrl || null, invoiceUrl || null, id]);
    res.json({ message: 'Request updated successfully.' });
  } catch (error) {
    console.error('[Commercial UPDATE Error]', error);
    res.status(500).json({ message: 'Failed to update request.' });
  }
};

// DELETE /api/commercial/:id
export const deleteRequest = async (req, res) => {
  const { id } = req.params;
  const isPlatformOwner = req.tenant.isPlatformOwner;

  try {
    if (!isPlatformOwner) {
      const checkRes = await query(`SELECT company_id FROM app_commercial.commercial_requests WHERE request_id = $1`, [id]);
      if (checkRes.rows.length === 0 || checkRes.rows[0].company_id !== req.tenant.companyId) {
        return res.status(403).json({ message: 'Forbidden access to this record.' });
      }
    }

    await query(`DELETE FROM app_commercial.commercial_requests WHERE request_id = $1`, [id]);
    res.json({ message: 'Request deleted successfully.' });
  } catch (error) {
    console.error('[Commercial DELETE Error]', error);
    res.status(500).json({ message: 'Failed to delete request.' });
  }
};

export const getSparePartsCatalog = async (req, res) => {
  const companyId = req.tenant.companyId;
  const { machineId } = req.query;

  try {
    // Join through quote_revisions and quotes to verify tenant ownership
    let sql = `
      SELECT DISTINCT 
        ql.item_description AS "partNumber",
        ql.item_description AS "name",
        ql.item_description AS "description",
        ql.price,
        0 AS "leadTimeDays"
      FROM app_commercial.quote_lines ql
      JOIN app_commercial.quote_revisions qr ON ql.quote_revision_id = qr.revision_id
      JOIN app_commercial.quotes q ON qr.quote_id = q.quote_id
      WHERE q.company_id = $1
    `;
    const params = [companyId];
    let paramIndex = 2;

    // Filter by specific machine if provided
    if (machineId && machineId !== 'Unknown Model') {
      sql += ` AND ql.machine_id = $${paramIndex}`;
      params.push(machineId);
      paramIndex++;
    }

    sql += ` LIMIT 50;`;
    
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('[Spare Parts GET Error]', error);
    res.status(500).json({ message: 'Failed to fetch spare parts catalog.' });
  }
};

export const getOrderHistory = async (req, res) => {
  const tenantCompanyId = req.tenant.companyId;
  const company = req.query.companyId || req.query.company || tenantCompanyId;
  const { machineId } = req.query;
  const isPlatformOwner = req.tenant.isPlatformOwner;

  if (!isPlatformOwner && tenantCompanyId !== company) {
    return res.status(403).json({ message: 'Forbidden access to this company data.' });
  }

  try {
    let sql = `
      SELECT 
        o.order_id AS "orderId",
        o.order_status AS "orderStatus",
        o.shipment_status AS "shipmentStatus",
        o.created_at AS "orderDate",
        COUNT(ol.line_id) AS "totalLines"
      FROM app_commercial.orders o
      LEFT JOIN app_commercial.order_lines ol ON o.order_id = ol.order_id
      WHERE o.company_id = $1
    `;
    const params = [company];
    let paramIndex = 2;

    // Filter to only show orders that contain parts for this specific machine
    if (machineId) {
      sql += ` AND EXISTS (
        SELECT 1 FROM app_commercial.order_lines ol2 
        WHERE ol2.order_id = o.order_id AND ol2.machine_id = $${paramIndex}
      )`;
      params.push(machineId);
      paramIndex++;
    }

    sql += `
      GROUP BY o.order_id
      ORDER BY o.created_at DESC
      LIMIT 10;
    `;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('[Order History GET Error]', error);
    res.status(500).json({ message: 'Failed to fetch order history.' });
  }
};

export const getMachinePurchaseDetails = async (req, res) => {
  const { machineId } = req.params;
  const companyId = req.tenant.companyId;

  try {
    const sql = `
      SELECT 
        m.delivery_date AS "deliveryDate",
        ql.item_description AS "itemDescription",
        ql.price,
        qr.discount_rate AS "discountRate",
        o.order_status AS "orderStatus",
        o.created_at AS "orderDate"
      FROM app_tenant.machines m
      JOIN app_commercial.quote_lines ql ON m.machine_id = ql.machine_id
      JOIN app_commercial.quote_revisions qr ON ql.quote_revision_id = qr.revision_id
      JOIN app_commercial.orders o ON o.quote_revision_id = qr.revision_id
      WHERE m.machine_id = $1 AND m.company_id = $2 AND o.company_id = $2
      ORDER BY o.created_at DESC
      LIMIT 1;
    `;
    const { rows } = await query(sql, [machineId, companyId]);
    res.json(rows);
  } catch (error) {
    console.error('[Purchase Details Error]', error);
    res.status(500).json({ message: 'Failed to fetch purchase details.' });
  }
};

export const getMachineQuotations = async (req, res) => {
  const { machineId } = req.params;
  const companyId = req.tenant.companyId;

  try {
    const sql = `
      SELECT 
        q.quote_id AS "quoteId",
        qr.revision_number AS "revisionNumber",
        qr.discount_rate AS "discountRate",
        qr.revision_status AS "revisionStatus",
        qr.created_at AS "revisionDate",
        ql.item_description AS "itemDescription",
        ql.price
      FROM app_commercial.quotes q
      JOIN app_commercial.quote_revisions qr ON q.quote_id = qr.quote_id
      JOIN app_commercial.quote_lines ql ON qr.revision_id = ql.quote_revision_id
      WHERE q.company_id = $1 AND ql.machine_id = $2
      ORDER BY qr.revision_number DESC
      LIMIT 5;
    `;
    const { rows } = await query(sql, [companyId, machineId]);
    res.json(rows);
  } catch (error) {
    console.error('[Quotations Error]', error);
    res.status(500).json({ message: 'Failed to fetch quotations.' });
  }
};

export const getMachineOrderLines = async (req, res) => {
  const { machineId } = req.params;
  const companyId = req.tenant.companyId;

  try {
    const sql = `
      SELECT 
        o.order_id AS "orderId",
        o.order_status AS "orderStatus",
        o.created_at AS "orderDate",
        ol.line_id AS "lineId",
        ol.item_description AS "itemDescription",
        ol.fulfillment_status AS "fulfillmentStatus"
      FROM app_commercial.orders o
      JOIN app_commercial.order_lines ol ON o.order_id = ol.order_id
      WHERE ol.machine_id = $1 AND o.company_id = $2
      ORDER BY o.created_at DESC
      LIMIT 20;
    `;
    const { rows } = await query(sql, [machineId, companyId]);
    res.json(rows);
  } catch (error) {
    console.error('[Machine Order Lines Error]', error);
    res.status(500).json({ message: 'Failed to fetch machine order lines.' });
  }
};