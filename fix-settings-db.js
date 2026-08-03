require('dotenv').config();
const { query } = require('./src/db');

async function fixSettings() {
  console.log('🔄 Checking settings table...');
  try {
    // Add feature_passes_enabled to settings
    console.log('Adding feature_passes_enabled to settings...');
    await query(`
      ALTER TABLE settings 
        ADD COLUMN IF NOT EXISTS feature_passes_enabled BOOLEAN DEFAULT FALSE;
    `);

    console.log('✅ Database schema updated successfully!');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
  } finally {
    process.exit(0);
  }
}

fixSettings();
