import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Initialize the connection pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  max: process.env.DB_MAX_CONNECTIONS || 20, // Max number of clients in the pool
  idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT_MS || 30000,
});

// Listen for unexpected errors on idle clients
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle database client:', err);
  process.exit(-1);
});

/**
 * Executes a database query using the connection pool.
 * This wrapper allows us to add logging, performance tracking, or global RLS settings later.
 * 
 * @param {string} text - The SQL query string
 * @param {Array} params - The array of parameterized values
 * @returns {Promise<Object>} - The query result
 */
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Optional: Log slow queries (e.g., taking longer than 500ms)
    if (duration > 500) {
      console.warn(`[DB WARN] Slow query (${duration}ms): ${text}`);
    }
    
    return result;
  } catch (error) {
    console.error(`[DB ERROR] Query failed: ${text}\nError:`, error.message);
    throw error;
  }
};

/**
 * Tests the database connection on server startup.
 */
export const testConnection = async () => {
  try {
    const res = await query('SELECT NOW() AS current_time, current_database() AS db_name');
    console.log(`✅ Successfully connected to PostgreSQL database [${res.rows[0].db_name}] at ${res.rows[0].current_time}`);
  } catch (error) {
    console.error('❌ Failed to connect to the database. Verify your .env credentials.');
    process.exit(1);
  }
};

// Export the pool directly in case a module needs transaction management (BEGIN/COMMIT)
export { pool };