require('dotenv').config()
const { query } = require('./src/db')

async function checkDatabase() {
  console.log('Connecting to AWS Database...')
  try {
    const result = await query(`
      SELECT vehicle_number, ticket_no, entry_time, exit_time, operator_name 
      FROM parking_records 
      ORDER BY entry_time DESC 
      LIMIT 10
    `)
    
    if (result.rows.length === 0) {
      console.log('⚠️ The database is currently EMPTY (0 records).')
    } else {
      console.log(`✅ Found ${result.rows.length} recent records in the database:`)
      console.table(result.rows)
    }
  } catch (err) {
    console.error('❌ Error reading database:', err.message)
  }
  process.exit(0)
}

checkDatabase()
