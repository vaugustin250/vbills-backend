require('dotenv').config()
const { query } = require('./src/db')

async function runMigration() {
  console.log('Adding ticket_no and operator_name columns to database...')
  try {
    await query(`ALTER TABLE parking_records ADD COLUMN IF NOT EXISTS ticket_no TEXT;`)
    await query(`ALTER TABLE parking_records ADD COLUMN IF NOT EXISTS operator_name TEXT;`)
    console.log('✅ Success! Columns added.')
  } catch (err) {
    console.error('❌ Error:', err.message)
  }
  process.exit(0)
}

runMigration()
