import { query } from '../../config/db.js';
import fetch from 'node-fetch';

// GET /api/chat/sessions
export const getSessions = async (req, res) => {
  const { search, viewAll, page = 1, limit = 25 } = req.query;
  const offset = (page - 1) * limit;
  
  const tenantCompanyId = req.tenant.companyId;
  const currentUserId = req.user.id;
  const currentUserRole = req.user.visibility; 
  const isPlatformOwner = req.tenant.isPlatformOwner;

  try {
    let whereClause = `WHERE s.company_id = $1`;
    const params = [tenantCompanyId];
    let paramIndex = 2;

    if (currentUserRole === 'full' && viewAll === 'true') {
      whereClause += ` AND (s.user_id = $${paramIndex} OR u.visibility != 'full')`;
      params.push(currentUserId);
      paramIndex++;
    } else if (!isPlatformOwner) {
      whereClause += ` AND s.user_id = $${paramIndex}`;
      params.push(currentUserId);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND s.title ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const statsSql = `
      SELECT COUNT(s.session_id) AS total_sessions
      FROM app_chat.chat_sessions s
      JOIN app_tenant.users u ON s.user_id = u.user_id
      ${whereClause}
    `;
    const statsRes = await query(statsSql, params);
    const totalSessions = parseInt(statsRes.rows[0].total_sessions) || 0;

    // UPDATED: Added s.machine_id to the SELECT statement
    const dataSql = `
      SELECT 
        s.session_id AS "id",
        s.title,
        s.machine_id,
        s.created_at AS "createdAt",
        s.updated_at AS "updatedAt",
        s.user_id AS "userId",
        u.first_name || ' ' || u.last_name AS "userName",
        u.visibility AS "userRole"
      FROM app_chat.chat_sessions s
      JOIN app_tenant.users u ON s.user_id = u.user_id
      ${whereClause}
      ORDER BY s.updated_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const dataParams = [...params, limit, offset];
    const dataRes = await query(dataSql, dataParams);

    res.json({
      data: dataRes.rows,
      pagination: {
        total: totalSessions,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalSessions / limit)
      }
    });
  } catch (error) {
    console.error('[Chat Sessions GET Error]', error);
    res.status(500).json({ message: 'Failed to fetch chat sessions.' });
  }
};

// GET /api/chat/sessions/:id
export const getSessionDetails = async (req, res) => {
  const { id } = req.params;
  const companyId = req.tenant.companyId;

  try {
    // UPDATED: Fetch machine_id alongside session_id and title
    const sessionRes = await query(
      `SELECT session_id, title, machine_id FROM app_chat.chat_sessions WHERE session_id = $1 AND company_id = $2`, 
      [id, companyId]
    );
    if (sessionRes.rows.length === 0) return res.status(404).json({ message: 'Session not found.' });

    const limit = 5;
    const messagesRes = await query(
      `SELECT message_id, role, content, created_at 
       FROM app_chat.chat_messages 
       WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2`, 
      [id, limit]
    );

    const roadmapRes = await query(
      `SELECT roadmap_json FROM app_chat.chat_roadmaps WHERE session_id = $1`, 
      [id]
    );

    res.json({
      session: sessionRes.rows[0],
      messages: messagesRes.rows.reverse(), 
      hasMore: messagesRes.rows.length === limit, 
      roadmap: roadmapRes.rows[0]?.roadmap_json || { steps: [] }
    });
  } catch (error) {
    console.error('[Chat GET Details Error]', error);
    res.status(500).json({ message: 'Failed to load chat history.' });
  }
};


// GET /api/chat/sessions/:id/messages
// Cursor-based pagination to load older messages when scrolling up
export const getSessionMessages = async (req, res) => {
  const { id } = req.params;
  const { before, limit = 5 } = req.query;

  try {
    const sql = `
      SELECT message_id, role, content, created_at 
      FROM app_chat.chat_messages 
      WHERE session_id = $1 AND created_at < $2 
      ORDER BY created_at DESC LIMIT $3
    `;
    
    const { rows } = await query(sql, [id, before, limit]);
    
    res.json({
      messages: rows.reverse(),
      hasMore: rows.length === parseInt(limit)
    });
  } catch (error) {
    console.error('[Load Messages Error]', error);
    res.status(500).json({ message: 'Failed to load messages.' });
  }
};




// POST /api/chat/sessions/:id/stream
// Pure SSE Proxy: Forwards the request to Python and pipes the stream back
export const streamMessage = async (req, res) => {
  const { id: sessionId } = req.params;

  console.log('[DEBUG] Raw React Payload (req.body):', JSON.stringify(req.body, null, 2));

  const { content, machine_name, serial_number } = req.body;
  
  // 1. Extract the strict security context from the Node.js auth middleware
  const companyId = req.tenant.companyId;
  const userId = req.user.id;
  const userRole = req.user.visibility; // e.g., 'full', 'technician', 'commercial'
  const authHeader = req.headers.authorization; // The Bearer JWT

  // 2. Setup Express SSE Headers for the React Client
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // 3. Construct the Payload for Python
    // Notice we do NOT send the chat history. Python will fetch that itself using the sessionId.
    const pythonPayload = {
      session_id: sessionId,
      company_id: companyId,
      user_id: userId,
      role: userRole,
      message: content,
      machine_name: machine_name || "Unknown Model",
      serial_number: serial_number || ""
    };

    // 4. Open the connection to the Python AI Engine
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
    
    const pythonResponse = await fetch(`${pythonApiUrl}/api/v1/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader // Pass the JWT so Python can cryptographically verify it if needed
      },
      body: JSON.stringify(pythonPayload)
    });

    if (!pythonResponse.ok) {
      console.error(`[Proxy Error] Python Engine returned status: ${pythonResponse.status}`);
      res.write(`data: ${JSON.stringify({ type: 'error', payload: 'AI Service is currently unavailable.' })}\n\n`);
      return res.end();
    }

    // 5. Pipe the SSE stream natively from Python -> Node.js -> React Frontend
    // This allows the "typing" effect to work seamlessly without Node.js buffering the response
    if (pythonResponse.body) {
      pythonResponse.body.on('data', (chunk) => {
        res.write(chunk);
      });

      pythonResponse.body.on('end', () => {
        res.end();
      });

      pythonResponse.body.on('error', (err) => {
        console.error('[Proxy Stream Error]', err);
        res.end();
      });
    } else {
      res.end();
    }

  } catch (error) {
    console.error('[Chat Proxy Fatal Error]', error);
    res.write(`data: ${JSON.stringify({ type: 'error', payload: 'Failed to connect to the AI Engine.' })}\n\n`);
    res.end();
  }
};


// POST /api/chat/sessions/:id/action
// Resolves the "Human in the Loop" confirmation
// POST /api/chat/sessions/:id/action
// Proxy HITL (Human-in-the-Loop) resolution to Python
export const confirmAction = async (req, res) => {
  const { id: sessionId } = req.params;
  const { action, details, approved, machine_id, title, type, urgency, description } = req.body;
  
  const companyId = req.tenant.companyId;
  const userId = req.user.id;
  const authHeader = req.headers.authorization;

  try {
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
    
    // Proxy the user's decision to Python
    const pythonResponse = await fetch(`${pythonApiUrl}/api/v1/chat/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        session_id: sessionId,
        company_id: companyId,
        user_id: userId,
        action,
        details,
        approved,
        machine_id,
        title,
        type,
        urgency,
        description
      })
    });

    if (!pythonResponse.ok) {
      return res.status(500).json({ message: 'AI Engine failed to process the action.' });
    }

    // Python executes the tool, saves the DB records, and returns a success string
    const data = await pythonResponse.json();
    
    // Return the AI's acknowledgment back to React
    res.json({ success: true, message: data.message });

  } catch (error) {
    console.error('[Action Proxy Error]', error);
    res.status(500).json({ message: 'Failed to communicate with AI Engine.' });
  }
};

// POST /api/chat/sessions
export const createSession = async (req, res) => {
  // UPDATED: Extract machine_id from the React frontend payload
  const { title, machine_id } = req.body;
  const companyId = req.tenant.companyId;
  const userId = req.user.id;

  if (!machine_id) {
    return res.status(400).json({ message: 'A machine_id is required to start a diagnostic session.' });
  }

  try {
    let finalTitle = title;
    
    if (!finalTitle || finalTitle.trim() === '') {
      const countRes = await query(
        `SELECT COUNT(session_id) FROM app_chat.chat_sessions WHERE user_id = $1`,
        [userId]
      );
      const previousChatCount = parseInt(countRes.rows[0].count, 10) || 0;
      finalTitle = `Diagnostic #${previousChatCount + 1}`;
    }

    // UPDATED: Insert machine_id into the database and return it
    const sql = `
      INSERT INTO app_chat.chat_sessions (company_id, user_id, title, machine_id)
      VALUES ($1, $2, $3, $4)
      RETURNING session_id AS "id", title, machine_id, created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    
    const { rows } = await query(sql, [companyId, userId, finalTitle, machine_id]);
    
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('[Chat CREATE Error]', error);
    res.status(500).json({ message: 'Failed to create chat session.' });
  }
};


// DELETE /api/chat/sessions/:id
// Deletes a session, its messages, summaries, and roadmaps (via ON DELETE CASCADE)
export const deleteSession = async (req, res) => {
  const { id } = req.params;
  const companyId = req.tenant.companyId;
  const userId = req.user.id;
  const isPlatformOwner = req.tenant.isPlatformOwner;
  const isAdmin = req.user.visibility === 'full';

  try {
    // 1. Verify ownership and tenant isolation
    const checkSql = `SELECT user_id FROM app_chat.chat_sessions WHERE session_id = $1 AND company_id = $2`;
    const checkRes = await query(checkSql, [id, companyId]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    // 2. Only the owner, a company admin, or AROL can delete a chat
    if (!isPlatformOwner && !isAdmin && checkRes.rows[0].user_id !== userId) {
      return res.status(403).json({ message: 'Forbidden. You can only delete your own chat sessions.' });
    }

    // 3. Delete the session
    await query(`DELETE FROM app_chat.chat_sessions WHERE session_id = $1`, [id]);
    res.json({ message: 'Chat session deleted successfully.' });
  } catch (error) {
    console.error('[Chat DELETE Error]', error);
    res.status(500).json({ message: 'Failed to delete chat session.' });
  }
};


// PUT /api/chat/sessions/:id/title
// Allows the user to manually rename their chat session
export const updateSessionTitle = async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  const companyId = req.tenant.companyId;
  const userId = req.user.id;
  const isPlatformOwner = req.tenant.isPlatformOwner;
  const isAdmin = req.user.visibility === 'full';

  if (!title || title.trim() === '') {
    return res.status(400).json({ message: 'Title cannot be empty.' });
  }

  try {
    // 1. Verify ownership
    const checkSql = `SELECT user_id FROM app_chat.chat_sessions WHERE session_id = $1 AND company_id = $2`;
    const checkRes = await query(checkSql, [id, companyId]);

    if (checkRes.rows.length === 0) return res.status(404).json({ message: 'Session not found.' });

    if (!isPlatformOwner && !isAdmin && checkRes.rows[0].user_id !== userId) {
      return res.status(403).json({ message: 'Forbidden. You can only modify your own chat sessions.' });
    }

    // 2. Update the title
    await query(
      `UPDATE app_chat.chat_sessions SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE session_id = $2`,
      [title, id]
    );

    res.json({ message: 'Title updated successfully.', title });
  } catch (error) {
    console.error('[Chat UPDATE Title Error]', error);
    res.status(500).json({ message: 'Failed to update chat title.' });
  }
};