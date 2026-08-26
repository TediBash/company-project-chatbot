import { query } from '../../config/db.js';

// ==========================================
// 1. ORDERS CRUD
// ==========================================

// GET /api/orders
export const getOrders = async (req, res) => {
  const { search, page = 1, limit = 25 } = req.query;
  const offset = (page - 1) * limit;

  // Enforce Tenant Isolation
  const companyId = req.tenant.isPlatformOwner && req.query.companyId 
    ? req.query.companyId 
    : req.tenant.companyId;

  try {
    let whereClause = `WHERE company_id = $1`;
    const params = [companyId];
    let paramIndex = 2;

    // Apply Search Filter (searching within notes or status)
    if (search) {
      whereClause += ` AND (notes ILIKE $${paramIndex} OR order_status ILIKE $${paramIndex} OR shipment_status ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // 1. Get Total Count for Pagination Metadata
    const countSql = `SELECT COUNT(order_id) AS total FROM app_commercial.orders ${whereClause}`;
    const countRes = await query(countSql, params);
    const totalRecords = parseInt(countRes.rows[0].total) || 0;

    // 2. Fetch Paginated Data
    const dataSql = `
      SELECT order_id AS "id", quote_id AS "quoteId", order_status AS "orderStatus", 
             order_date AS "orderDate", expected_delivery_date AS "expectedDeliveryDate", 
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

  try {
    // 1. Fetch Order
    const orderSql = `
      SELECT order_id AS "id", quote_id AS "quoteId", order_status AS "orderStatus", 
             order_date AS "orderDate", expected_delivery_date AS "expectedDeliveryDate", 
             shipment_status AS "shipmentStatus", currency, notes
      FROM app_commercial.orders 
      WHERE order_id = $1 AND company_id = $2
    `;
    const orderRes = await query(orderSql, [id, companyId]);
    if (orderRes.rows.length === 0) return res.status(404).json({ message: 'Order not found.' });

    // 2. Fetch Order Lines
    const linesSql = `
      SELECT line_id AS "id", fulfillment_status AS "fulfillmentStatus"
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
  const { quoteId, orderStatus, orderDate, expectedDeliveryDate, shipmentStatus, currency, notes } = req.body;
  const companyId = req.tenant.companyId;

  try {
    const sql = `
      INSERT INTO app_commercial.orders 
        (company_id, quote_id, order_status, order_date, expected_delivery_date, shipment_status, currency, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING order_id AS "id", order_status AS "orderStatus", order_date AS "orderDate"
    `;
    const { rows } = await query(sql, [
      companyId, quoteId || null, orderStatus, orderDate, expectedDeliveryDate, shipmentStatus, currency, notes
    ]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('[CREATE Order Error]', error);
    res.status(500).json({ message: 'Failed to create order.' });
  }
};

// PUT /api/orders/:id
export const updateOrder = async (req, res) => {
  const { id } = req.params;
  const { orderStatus, orderDate, expectedDeliveryDate, shipmentStatus, currency, notes } = req.body;
  const companyId = req.tenant.companyId;

  try {
    const sql = `
      UPDATE app_commercial.orders 
      SET order_status = $1, order_date = $2, expected_delivery_date = $3, 
          shipment_status = $4, currency = $5, notes = $6
      WHERE order_id = $7 AND company_id = $8
      RETURNING order_id AS "id"
    `;
    const { rows } = await query(sql, [
      orderStatus, orderDate, expectedDeliveryDate, shipmentStatus, currency, notes, id, companyId
    ]);
    if (rows.length === 0) return res.status(404).json({ message: 'Order not found or access denied.' });
    
    res.json({ message: 'Order updated successfully.' });
  } catch (error) {
    console.error('[UPDATE Order Error]', error);
    res.status(500).json({ message: 'Failed to update order.' });
  }
};

// DELETE /api/orders/:id
export const deleteOrder = async (req, res) => {
  const { id } = req.params;
  const companyId = req.tenant.companyId;

  try {
    const sql = `DELETE FROM app_commercial.orders WHERE order_id = $1 AND company_id = $2 RETURNING order_id`;
    const { rows } = await query(sql, [id, companyId]);
    
    if (rows.length === 0) return res.status(404).json({ message: 'Order not found or access denied.' });
    res.json({ message: 'Order deleted successfully.' });
  } catch (error) {
    console.error('[DELETE Order Error]', error);
    res.status(500).json({ message: 'Failed to delete order.' });
  }
};

// ==========================================
// 2. ORDER LINES (Nested Actions)
// ==========================================

// ==========================================
// 2. ORDER LINES CRUD (Expanded)
// ==========================================

// GET /api/orders/:orderId/lines
export const getOrderLines = async (req, res) => {
  const { orderId } = req.params;
  const companyId = req.tenant.companyId;

  try {
    // 1. Verify order belongs to tenant
    const orderCheck = await query(
      `SELECT order_id FROM app_commercial.orders WHERE order_id = $1 AND company_id = $2`,
      [orderId, companyId]
    );
    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found or access denied.' });
    }

    // 2. Fetch lines
    const sql = `
      SELECT line_id AS "id", order_id AS "orderId", fulfillment_status AS "fulfillmentStatus"
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

// POST /api/orders/:id/lines (Already created previously, kept here for completeness)
export const createOrderLine = async (req, res) => {
  const { id: orderId } = req.params;
  const { fulfillmentStatus } = req.body;
  const companyId = req.tenant.companyId;

  try {
    const checkRes = await query(
      `SELECT order_id FROM app_commercial.orders WHERE order_id = $1 AND company_id = $2`, 
      [orderId, companyId]
    );
    if (checkRes.rows.length === 0) return res.status(404).json({ message: 'Order not found.' });

    const sql = `
      INSERT INTO app_commercial.order_lines (order_id, fulfillment_status)
      VALUES ($1, $2)
      RETURNING line_id AS "id", order_id AS "orderId", fulfillment_status AS "fulfillmentStatus"
    `;
    const { rows } = await query(sql, [orderId, fulfillmentStatus]);
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
  const companyId = req.tenant.companyId;

  try {
    // Security check via JOIN with orders to verify tenant ownership
    const sql = `
      UPDATE app_commercial.order_lines ol
      SET fulfillment_status = $1
      FROM app_commercial.orders o
      WHERE ol.order_id = o.order_id 
        AND ol.line_id = $2 
        AND o.company_id = $3
      RETURNING ol.line_id AS "id", ol.fulfillment_status AS "fulfillmentStatus"
    `;
    const { rows } = await query(sql, [fulfillmentStatus, lineId, companyId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Order line not found or access denied.' });
    }
    
    res.json({ message: 'Order line updated successfully.', data: rows[0] });
  } catch (error) {
    console.error('[UPDATE Order Line Error]', error);
    res.status(500).json({ message: 'Failed to update order line.' });
  }
};

// DELETE /api/orders/lines/:lineId
export const deleteOrderLine = async (req, res) => {
  const { lineId } = req.params;
  const companyId = req.tenant.companyId;

  try {
    // Security check via JOIN with orders
    const sql = `
      DELETE FROM app_commercial.order_lines ol
      USING app_commercial.orders o
      WHERE ol.order_id = o.order_id 
        AND ol.line_id = $1 
        AND o.company_id = $2
      RETURNING ol.line_id
    `;
    const { rows } = await query(sql, [lineId, companyId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Order line not found or access denied.' });
    }
    
    res.json({ message: 'Order line deleted successfully.' });
  } catch (error) {
    console.error('[DELETE Order Line Error]', error);
    res.status(500).json({ message: 'Failed to delete order line.' });
  }
};