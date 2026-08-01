const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'vbills',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,               // max 20 simultaneous connections (handles 1000 users via pooling)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

pool.on('connect', () => {
  // Successfully connected from pool
})

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message)
})

// Helper to run a parameterized query — prevents SQL injection
async function query(text, params) {
  const start = Date.now()
  const res = await pool.query(text, params)
  const duration = Date.now() - start
  if (duration > 1000) {
    console.warn(`[SLOW QUERY] ${duration}ms — ${text.slice(0, 80)}`)
  }
  return res
}

// Test DB connection on startup
;(async () => {
  try {
    const res = await pool.query('SELECT NOW()')
    console.log(`✅ PostgreSQL connected at ${res.rows[0].now}`)
  } catch (err) {
    console.error('❌ Database connection failed:', err.message)
    console.error('   Make sure PostgreSQL is running and .env credentials are correct.')
    process.exit(1)
  }
})()

module.exports = { pool, query }
