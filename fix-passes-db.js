require('dotenv').config();
const { query } = require('./src/db');
const fs = require('fs');

async function run() {
  console.log('🔄 Checking database tables...');
  
  try {
    // 1. Feature flags
    console.log('Adding feature flags to tenants...');
    const sql3 = fs.readFileSync('./src/migrations/003_feature_flags.sql', 'utf8');
    await query(sql3);
    console.log('✅ Feature flags added!');

    // 2. Shift Reports
    console.log('Creating shift reports table...');
    const sql2 = fs.readFileSync('./src/migrations/002_shift_reports.sql', 'utf8');
    await query(sql2);
    console.log('✅ Shift reports table created!');

    // 3. Parking Passes
    console.log('Creating parking passes table...');
    const sql4 = fs.readFileSync('./src/migrations/004_parking_passes.sql', 'utf8');
    await query(sql4);
    console.log('✅ Parking passes table created!');

    console.log('🎉 All Database fixes applied successfully!');
  } catch (err) {
    console.error('❌ ERROR:', err.message);
  } finally {
    process.exit(0);
  }
}

run();
