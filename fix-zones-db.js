require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'vbills',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixDatabase() {
  console.log('🔄 Checking database tables for missing Zone columns...');
  try {
    const client = await pool.connect();
    
    // Add missing columns to parking_zones
    console.log('Adding missing columns to parking_zones...');
    await client.query(`
      ALTER TABLE parking_zones 
        ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6366f1',
        ADD COLUMN IF NOT EXISTS description TEXT,
        ADD COLUMN IF NOT EXISTS slot_diagram_enabled BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS rows_count INTEGER,
        ADD COLUMN IF NOT EXISTS cols_count INTEGER;
    `);

    // Add status column to parking_records to support offline sync query logic
    console.log('Adding status column to parking_records...');
    await client.query(`
      ALTER TABLE parking_records
        ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PARKED';
    `);

    console.log('✅ Database schema updated successfully!');
    client.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('   Make sure PostgreSQL is running and .env credentials are correct.');
  } finally {
    pool.end();
  }
}

fixDatabase();
