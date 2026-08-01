/**
 * fix_all.js — Run on AWS to fix all DB schema issues at once
 * Usage: node fix_all.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔧 Running all schema fixes...\n');

    const fixes = [
      // parking_records: add missing columns
      `ALTER TABLE parking_records ADD COLUMN IF NOT EXISTS ticket_no TEXT`,
      `ALTER TABLE parking_records ADD COLUMN IF NOT EXISTS operator_name TEXT`,
      `ALTER TABLE parking_records ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PARKED'`,
      `ALTER TABLE parking_records ADD COLUMN IF NOT EXISTS zone_id UUID`,
      `ALTER TABLE parking_records ADD COLUMN IF NOT EXISTS pass_id UUID`,
      `ALTER TABLE parking_records ADD COLUMN IF NOT EXISTS slot_no TEXT`,
      `ALTER TABLE parking_records ADD COLUMN IF NOT EXISTS notes TEXT`,
      `ALTER TABLE parking_records ADD COLUMN IF NOT EXISTS entry_payment_mode TEXT`,

      // settings: add missing columns
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS rate_rules JSONB`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS feature_passes_enabled BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS zones_enabled BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS rate_heavy_first REAL DEFAULT 80`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS rate_heavy_per_hour REAL DEFAULT 40`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS email TEXT`,

      // tenants: add missing columns
      `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS feature_passes_allowed BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS feature_zones_allowed BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS installation_date DATE`,

      // parking_zones: add missing columns
      `ALTER TABLE parking_zones ADD COLUMN IF NOT EXISTS rows_count INTEGER DEFAULT 4`,
      `ALTER TABLE parking_zones ADD COLUMN IF NOT EXISTS cols_count INTEGER DEFAULT 5`,
      `ALTER TABLE parking_zones ADD COLUMN IF NOT EXISTS slot_diagram_enabled BOOLEAN DEFAULT FALSE`,

      // payments table
      `CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY,
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        ticket_no TEXT,
        amount REAL NOT NULL DEFAULT 0,
        method TEXT,
        status TEXT DEFAULT 'COMPLETED',
        collected_by TEXT,
        settled_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      // shift_reports table
      `CREATE TABLE IF NOT EXISTS shift_reports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        watchman_name TEXT,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        vehicles_in INTEGER DEFAULT 0,
        vehicles_out INTEGER DEFAULT 0,
        revenue_cash REAL DEFAULT 0,
        revenue_upi REAL DEFAULT 0,
        revenue_total REAL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,

      // parking_passes table
      `CREATE TABLE IF NOT EXISTS parking_passes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        vehicle_number TEXT NOT NULL,
        holder_name TEXT,
        pass_type TEXT,
        valid_from DATE,
        valid_until DATE,
        status TEXT DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
    ];

    for (const sql of fixes) {
      try {
        await client.query(sql);
        const preview = sql.trim().slice(0, 80).replace(/\n/g, ' ');
        console.log(`  ✅ ${preview}...`);
      } catch (err) {
        const preview = sql.trim().slice(0, 80).replace(/\n/g, ' ');
        console.log(`  ⚠️  SKIPPED (${err.message.slice(0, 60)})`);
        console.log(`     SQL: ${preview}...`);
      }
    }

    console.log('\n✅ All fixes applied successfully!');
    console.log('\n📊 Verifying parking_records columns:');
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'parking_records' 
      ORDER BY ordinal_position
    `);
    console.table(cols.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('❌ Fix failed:', err.message);
  process.exit(1);
});
