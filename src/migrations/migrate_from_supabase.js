/**
 * VBills — Supabase to PostgreSQL Data Migration Script
 * =====================================================
 * This script safely migrates ALL existing data from your
 * Supabase project into the new VBills PostgreSQL database.
 *
 * HOW TO USE:
 * 1. Fill in your credentials in .env
 * 2. Run: node src/migrations/migrate_from_supabase.js
 */

require('dotenv').config()
const { Pool } = require('pg')
const https = require('https')

const TARGET_DB = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

// Helper to fetch from Supabase REST API
async function fetchFromSupabase(table, params = '') {
  return new Promise((resolve, reject) => {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*${params}`
    const options = {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    }
    https.get(url, options, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error(`Failed to parse response from ${table}`)) }
      })
    }).on('error', reject)
  })
}

async function migrate() {
  console.log('🚀 Starting VBills data migration from Supabase...\n')

  // 1. Migrate Tenants
  console.log('📦 Migrating tenants...')
  const tenants = await fetchFromSupabase('tenants')
  for (const t of tenants) {
    await TARGET_DB.query(
      `INSERT INTO tenants (id, business_name, email, phone, address, license_status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.business_name, t.email, t.phone, t.address, t.license_status || 'ACTIVE', t.created_at]
    )
  }
  console.log(`   ✅ ${tenants.length} tenants migrated`)

  // 2. Migrate Settings
  console.log('📦 Migrating settings...')
  const settings = await fetchFromSupabase('settings')
  for (const s of settings) {
    await TARGET_DB.query(
      `INSERT INTO settings (
        tenant_id, company_name, address, phone, currency_symbol, total_slots,
        grace_period_minutes, gst_percent, receipt_footer, upi_id, upi_phone,
        upi_qr_url, upi_payee_name, rate_two_wheeler_first, rate_two_wheeler_per_hour,
        rate_four_wheeler_first, rate_four_wheeler_per_hour, rate_heavy_first, rate_heavy_per_hour
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [
        s.tenant_id, s.company_name, s.address, s.phone, s.currency_symbol, s.total_slots,
        s.grace_period_minutes, s.gst_percent, s.receipt_footer, s.upi_id, s.upi_phone,
        s.upi_qr_url, s.upi_payee_name, s.rate_two_wheeler_first, s.rate_two_wheeler_per_hour,
        s.rate_four_wheeler_first, s.rate_four_wheeler_per_hour, s.rate_heavy_first, s.rate_heavy_per_hour
      ]
    )
  }
  console.log(`   ✅ ${settings.length} settings migrated`)

  // 3. Migrate Parking Records (most important!)
  console.log('📦 Migrating parking records (this may take a while)...')
  const records = await fetchFromSupabase('parking_records', '&order=entry_time.asc')
  let migratedCount = 0
  for (const r of records) {
    try {
      await TARGET_DB.query(
        `INSERT INTO parking_records (
          id, tenant_id, vehicle_number, vehicle_type, driver_name, driver_phone,
          entry_time, exit_time, duration_minutes, amount_charged, amount_paid_at_entry,
          amount_paid_at_exit, payment_method, zone
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id, entry_time) DO NOTHING`,
        [
          r.id, r.tenant_id, r.vehicle_number, r.vehicle_type, r.driver_name, r.driver_phone,
          r.entry_time, r.exit_time, r.duration_minutes, r.amount_charged, r.amount_paid_at_entry,
          r.amount_paid_at_exit, r.payment_method || r.payment_method_at_entry, r.zone
        ]
      )
      migratedCount++
    } catch (err) {
      console.warn(`   ⚠️  Skipped record ${r.id}: ${err.message}`)
    }
  }
  console.log(`   ✅ ${migratedCount}/${records.length} parking records migrated`)

  console.log('\n🎉 Migration complete! Your Supabase data is now safely in PostgreSQL.')
  console.log('   ⚠️  Important: Keep your Supabase database as a read-only backup until verified.')

  await TARGET_DB.end()
}

migrate().catch((err) => {
  console.error('\n❌ Migration failed:', err.message)
  process.exit(1)
})
