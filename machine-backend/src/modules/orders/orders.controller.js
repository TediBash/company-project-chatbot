import { query } from '../../config/db.js';

// ==========================================
// 1. ORDERS CRUD
// ==========================================

// GET /api/orders
export const getOrders = async (req, res) => {
  const { search, quoteId, page = 1, limit = 25, companyId } = req.query;
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
    // If Platform Owner AND no companyId provided, skip the filter to show ALL orders

    // Apply Search Filter (searching within notes or status)
    if (search) {
      whereClause += ` AND (notes ILIKE $${paramIndex} OR order_status ILIKE $${paramIndex} OR shipment_status ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (quoteId) {
      whereClause += ` AND CAST(quote_id AS TEXT) ILIKE $${paramIndex}`;
      params.push(`%${quoteId}%`);
      paramIndex++;
    }

    // 1. Get Total Count for Pagination Metadata
    const countSql = `SELECT COUNT(order_id) AS total FROM app_commercial.orders ${whereClause}`;
    const countRes = await query(countSql, params);
    const totalRecords = parseInt(countRes.rows[0].total) || 0;

    // 2. Fetch Paginated Data
    // NOTE: Added company_id AS "companyId" to explicitly return the tenant reference
    const dataSql = `
      SELECT order_id AS "id", company_id AS "companyId", quote_revision_id AS "quoteId", 
             order_status AS "orderStatus", order_date AS "orderDate", 
             expected_delivery_date AS "expectedDeliveryDate", 
             shipment_status AS "shipmentStatus", currency, notes
      FROM app_commercial.orders 
      ${whereClause} 
      ORDER BY order_date DESC NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
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
    console.error('[GET Orders Error]', error);
    res.status(500).json({ message: 'Failed to fetch orders.' });
  }
};

// GET /api/orders/:id
export const getOrderDetails = async (req, res) => {
  const { id } = req.params;
  const companyId = req.tenant.companyId;
  const isPlatformOwner = req.tenant.isPlatformOwner;

  try {
    // Bypass strict company check for Platform Owners & return companyId
    const orderSql = isPlatformOwner
      ? `
        SELECT order_id AS "id", company_id AS "companyId", quote_revision_id AS "quoteId", order_status AS "orderStatus", 
               order_date AS "orderDate", expected_delivery_date AS "expectedDeliveryDate", 
               shipment_status AS "shipmentStatus", currency, notes
        FROM app_commercial.orders 
        WHERE order_id = $1
      `
      : `
        SELECT order_id AS "id", company_id AS "companyId", quote_revision_id AS "quoteId", order_status AS "orderStatus", 
               order_date AS "orderDate", expected_delivery_date AS "expectedDeliveryDate", 
               shipment_status AS "shipmentStatus", currency, notes
        FROM app_commercial.orders 
        WHERE order_id = $1 AND company_id = $2
      `;
      
    const params = isPlatformOwner ? [id] : [id, companyId];
    const orderRes = await query(orderSql, params);
    
    if (orderRes.rows.length === 0) return res.status(404).json({ message: 'Order not found.' });

    // 2. Fetch Order Lines
    const linesSql = `
      SELECT 
        line_id AS "id", 
        fulfillment_status AS "fulfillmentStatus",
        item_description AS "itemDescription",
        machine_id AS "machineId"
      FROM app_commercial.order_lines 
      WHERE order_id = $1
    `;
    const linesRes = await query(linesSql, [id]);

    res.json({
      ...orderRes.rows[0],
      lines: linesRes.rows
    });
  } catch (error) {
    console.error('[GET Order Details Error]', error);
    res.status(500).json({ message: 'Failed to fetch order details.' });
  }
};

// POST /api/orders
export const createOrder = async (req, res) => {
  const { 
    companyId, // Extract from body instead of req.tenant
    quoteId, 
    quoteRevisionId, 
    orderStatus, 
    orderDate, 
    expectedDeliveryDate, 
    shipmentStatus, 
    currency, 
    notes 
  } = req.body;
  
  if (!companyId) return res.status(400).json({ message: 'Company ID is required.' });

  try {
    const orderSql = `
      INSERT INTO app_commercial.orders 
        (company_id, quote_revision_id, order_status, order_date, expected_delivery_date, shipment_status, currency, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING order_id AS "id", order_status AS "orderStatus", order_date AS "orderDate"
    `;
    
    const { rows } = await query(orderSql, [
      companyId, 
      quoteRevisionId || null, 
      orderStatus, 
      orderDate, 
      expectedDeliveryDate || null, 
      shipmentStatus, 
      currency, 
      notes
    ]);
    
    const newOrderId = rows[0].id;

    // Automatically generate Order Lines from the Quote Revision Lines
    if (quoteRevisionId) {
      const linesSql = `
        INSERT INTO app_commercial.order_lines (
          order_id, fulfillment_status, quote_line_id, item_description, machine_id
        )
        SELECT $1, 'Pending', line_id, item_description, machine_id
        FROM app_commercial.quote_lines
        WHERE quote_revision_id = $2
      `;
      await query(linesSql, [newOrderId, quoteRevisionId]);
    }

    res.status(201).json({ message: 'Order created successfully.', data: rows[0] });
  } catch (error) {
    console.error('[CREATE Order Error]', error);
    res.status(500).json({ message: 'Failed to create order.' });
  }
};

// PUT /api/orders/:id
export const updateOrder = async (req, res) => {
  const { id } = req.params;
  const { orderStatus, orderDate, expectedDeliveryDate, shipmentStatus, currency, notes } = req.body;

  try {
    const sql = `
      UPDATE app_commercial.orders 
      SET order_status = $1, order_date = $2, expected_delivery_date = $3, 
          shipment_status = $4, currency = $5, notes = $6
      WHERE order_id = $7
      RETURNING order_id AS "id"
    `;
    const { rows } = await query(sql, [orderStatus, orderDate, expectedDeliveryDate, shipmentStatus, currency, notes, id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Order not found.' });
    
    res.json({ message: 'Order updated successfully.' });
  } catch (error) {
    console.error('[UPDATE Order Error]', error);
    res.status(500).json({ message: 'Failed to update order.' });
  }
};

// DELETE /api/orders/:id
export const deleteOrder = async (req, res) => {
  const { id } = req.params;

  try {
    const sql = `DELETE FROM app_commercial.orders WHERE order_id = $1 RETURNING order_id`;
    const { rows } = await query(sql, [id]);
    
    if (rows.length === 0) return res.status(404).json({ message: 'Order not found.' });
    res.json({ message: 'Order deleted successfully.' });
  } catch (error) {
    console.error('[DELETE Order Error]', error);
    res.status(500).json({ message: 'Failed to delete order.' });
  }
};

// ==========================================
// 2. ORDER LINES (Nested Actions)
// ==========================================

// GET /api/orders/:orderId/lines
export const getOrderLines = async (req, res) => {
  const { orderId } = req.params;
  const companyId = req.tenant.companyId;
  const isPlatformOwner = req.tenant.isPlatformOwner;

  try {
    if (!isPlatformOwner) {
      // 1. Verify order belongs to standard tenant
      const orderCheck = await query(
        `SELECT order_id FROM app_commercial.orders WHERE order_id = $1 AND company_id = $2`,
        [orderId, companyId]
      );
      if (orderCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Order not found or access denied.' });
      }
    }

    // 2. Fetch lines
    const sql = `
      SELECT line_id AS "id", order_id AS "orderId", fulfillment_status AS "fulfillmentStatus",
             item_description AS "itemDescription", machine_id AS "machineId"
      FROM app_commercial.order_lines 
      WHERE order_id = $1
    `;
    const { rows } = await query(sql, [orderId]);
    res.json(rows);
  } catch (error) {
    console.error('[GET Order Lines Error]', error);
    res.status(500).json({ message: 'Failed to fetch order lines.' });
  }
};

// POST /api/orders/:id/lines 
export const createOrderLine = async (req, res) => {
  const { id: orderId } = req.params;
  const { fulfillmentStatus, itemDescription, machineId } = req.body;

  try {
    const sql = `
      INSERT INTO app_commercial.order_lines (order_id, fulfillment_status, item_description, machine_id)
      VALUES ($1, $2, $3, $4)
      RETURNING line_id AS "id"
    `;
    const { rows } = await query(sql, [orderId, fulfillmentStatus, itemDescription, machineId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('[CREATE Order Line Error]', error);
    res.status(500).json({ message: 'Failed to add order line.' });
  }
};

// PUT /api/orders/lines/:lineId
export const updateOrderLine = async (req, res) => {
  const { lineId } = req.params;
  const { fulfillmentStatus } = req.body;

  try {
    const sql = `
      UPDATE app_commercial.order_lines
      SET fulfillment_status = $1
      WHERE line_id = $2 
      RETURNING line_id AS "id"
    `;
    const { rows } = await query(sql, [fulfillmentStatus, lineId]);
    
    if (rows.length === 0) return res.status(404).json({ message: 'Order line not found.' });
    res.json({ message: 'Order line updated successfully.' });
  } catch (error) {
    console.error('[UPDATE Order Line Error]', error);
    res.status(500).json({ message: 'Failed to update order line.' });
  }
};

// DELETE /api/orders/lines/:lineId
export const deleteOrderLine = async (req, res) => {
  const { lineId } = req.params;

  try {
    const sql = `DELETE FROM app_commercial.order_lines WHERE line_id = $1 RETURNING line_id`;
    const { rows } = await query(sql, [lineId]);
    
    if (rows.length === 0) return res.status(404).json({ message: 'Order line not found.' });
    res.json({ message: 'Order line deleted successfully.' });
  } catch (error) {
    console.error('[DELETE Order Line Error]', error);
    res.status(500).json({ message: 'Failed to delete order line.' });
  }
};