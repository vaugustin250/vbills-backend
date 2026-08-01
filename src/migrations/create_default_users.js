require('dotenv').config()
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

async function createUsers() {
  console.log('Creating default users...')
  
  // 1. Get the first tenant (from the migration)
  const tenantRes = await pool.query('SELECT id, business_name FROM tenants LIMIT 1')
  if (tenantRes.rows.length === 0) {
    console.log('❌ No tenants found. Run migration first.')
    process.exit(1)
  }
  
  const tenant = tenantRes.rows[0]
  console.log(`Found tenant: ${tenant.business_name} (${tenant.id})`)
  
  const passwordHash = await bcrypt.hash('password123', 12)
  
  // 2. Create Super Admin
  await pool.query(
    `INSERT INTO users (tenant_id, full_name, email, password_hash, role) 
     VALUES ($1, 'Super Admin', 'admin@vbills.com', $2, 'SUPER_ADMIN')
     ON CONFLICT (email) DO NOTHING`,
    [tenant.id, passwordHash]
  )
  
  // 3. Create Manager
  await pool.query(
    `INSERT INTO users (tenant_id, full_name, email, password_hash, role) 
     VALUES ($1, 'Manager', 'manager@vbills.com', $2, 'MANAGER')
     ON CONFLICT (email) DO NOTHING`,
    [tenant.id, passwordHash]
  )
  
  // 4. Create Watchman
  await pool.query(
    `INSERT INTO users (tenant_id, full_name, email, password_hash, role) 
     VALUES ($1, 'Watchman', 'watchman@vbills.com', $2, 'WATCHMAN')
     ON CONFLICT (email) DO NOTHING`,
    [tenant.id, passwordHash]
  )
  
  console.log('✅ Users created successfully!')
  console.log('--------------------------------')
  console.log('Super Admin : admin@vbills.com')
  console.log('Manager     : manager@vbills.com')
  console.log('Watchman    : watchman@vbills.com')
  console.log('Password    : password123')
  console.log('--------------------------------')
  
  process.exit(0)
}

createUsers().catch(err => {
  console.error(err)
  process.exit(1)
})
