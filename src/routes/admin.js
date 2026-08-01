const express = require('express')
const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')
const { query } = require('../db')
const { requireRole } = require('../middleware/auth')

const router = express.Router()

// All admin routes require SUPER_ADMIN role
router.use(requireRole('SUPER_ADMIN'))

// GET /api/admin/tenants — List all companies
router.get('/tenants', async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*, s.company_name, s.total_slots
       FROM tenants t
       LEFT JOIN settings s ON s.tenant_id = t.id
       ORDER BY t.created_at DESC`
    )
    res.json({ tenants: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenants' })
  }
})

// GET /api/admin/tenants/:id — Get specific company details
router.get('/tenants/:id', async (req, res) => {
  try {
    const tenantId = req.params.id
    
    // Fetch tenant + settings
    const tenantRes = await query(`
      SELECT t.*, s.company_name, s.total_slots, s.grace_period_minutes, s.currency_symbol, s.email as settings_email, s.phone as settings_phone
      FROM tenants t
      LEFT JOIN settings s ON s.tenant_id = t.id
      WHERE t.id = $1
    `, [tenantId])
    
    if (tenantRes.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' })
    const tenant = tenantRes.rows[0]

    // Fetch users
    const usersRes = await query(`SELECT id, full_name, email, phone, role, active, created_at, last_login FROM users WHERE tenant_id = $1 ORDER BY created_at`, [tenantId])
    
    // Fetch zones
    const zonesRes = await query(`SELECT * FROM parking_zones WHERE tenant_id = $1 ORDER BY zone_order`, [tenantId])

    res.json({ tenant, settings: tenant, users: usersRes.rows, zones: zonesRes.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenant details' })
  }
})

// POST /api/admin/tenants — Create a new company + manager account
router.post('/tenants', async (req, res) => {
  try {
    const {
      company, settings, manager
    } = req.body

    if (!company.business_name || !manager.email || !manager.password) {
      return res.status(400).json({ error: 'Business name, manager email and password are required' })
    }

    const tenantId = uuidv4()
    const managerId = uuidv4()

    // Create tenant
    await query(
      `INSERT INTO tenants (id, business_name, email, phone, address, license_status, installation_date, renewal_end)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, company.business_name, company.email, company.phone, company.address, company.license_status, company.installation_date || null, company.renewal_end || null]
    )

    // Create default settings
    await query(
      `INSERT INTO settings (
         tenant_id, company_name, total_slots, currency_symbol, grace_period_minutes,
         rate_two_wheeler_first, rate_two_wheeler_per_hour,
         rate_four_wheeler_first, rate_four_wheeler_per_hour,
         rate_heavy_first, rate_heavy_per_hour
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        tenantId, company.business_name, settings.total_slots || 50, settings.currency_symbol || '₹', settings.grace_period_minutes || 10,
        settings.rate_two_wheeler_first || 0, settings.rate_two_wheeler_per_hour || 0,
        settings.rate_four_wheeler_first || 0, settings.rate_four_wheeler_per_hour || 0,
        settings.rate_heavy_first || 0, settings.rate_heavy_per_hour || 0
      ]
    )

    // Create manager account
    const hash = await bcrypt.hash(manager.password, 12)
    await query(
      `INSERT INTO users (id, tenant_id, full_name, email, password_hash, phone, role)
       VALUES ($1,$2,$3,$4,$5,$6,'MANAGER')`,
      [managerId, tenantId, manager.full_name || company.business_name, manager.email, hash, manager.phone || null]
    )

    res.status(201).json({ message: 'Company created successfully', tenantId })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with that email already exists' })
    }
    console.error('[admin/tenants POST]', err)
    res.status(500).json({ error: 'Failed to create company' })
  }
})

// PATCH /api/admin/tenants/:id/status — Update license status
router.patch('/tenants/:id/status', async (req, res) => {
  try {
    const { status } = req.body
    const validStatuses = ['ACTIVE', 'TRIAL', 'SUSPENDED', 'EXPIRED']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    await query('UPDATE tenants SET license_status = $1 WHERE id = $2', [status, req.params.id])
    res.json({ message: 'Status updated' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' })
  }
})

// PATCH /api/admin/tenants/:id/feature — Toggle feature flag
router.patch('/tenants/:id/feature', async (req, res) => {
  try {
    const { feature, value } = req.body
    const validFeatures = ['feature_anpr', 'feature_qr', 'zones_enabled', 'feature_passes_allowed', 'feature_zones_allowed']
    if (!validFeatures.includes(feature)) {
      return res.status(400).json({ error: 'Invalid feature flag' })
    }
    await query(`UPDATE tenants SET ${feature} = $1 WHERE id = $2`, [value, req.params.id])
    res.json({ message: 'Feature updated' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update feature' })
  }
})

// PUT /api/admin/tenants/:id — Update company and settings
router.put('/tenants/:id', async (req, res) => {
  try {
    const tenantId = req.params.id
    const s = req.body

    // Update settings
    await query(
      `INSERT INTO settings (tenant_id, company_name, total_slots, phone, email, currency_symbol, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id) DO UPDATE SET
         company_name = EXCLUDED.company_name,
         total_slots = EXCLUDED.total_slots,
         phone = EXCLUDED.phone,
         email = EXCLUDED.email,
         currency_symbol = EXCLUDED.currency_symbol,
         address = EXCLUDED.address`,
      [tenantId, s.company_name, s.total_slots, s.phone, s.email, s.currency_symbol, s.address]
    )

    // Update tenant basic info
    await query(
      `UPDATE tenants SET business_name = COALESCE($1, business_name), email = $2, phone = $3, address = $4 WHERE id = $5`,
      [s.company_name, s.email, s.phone, s.address, tenantId]
    )

    res.json({ message: 'Settings updated' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update settings' })
  }
})

// GET /api/admin/users — List all staff for a tenant
router.get('/users', async (req, res) => {
  try {
    const { tenantId } = req.query
    const result = await query(
      `SELECT id, full_name, email, phone, role, active, created_at, last_login
       FROM users WHERE tenant_id = $1 ORDER BY role, full_name`,
      [tenantId]
    )
    res.json({ users: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// POST /api/admin/users — Create a new user (watchman or manager)
router.post('/users', async (req, res) => {
  try {
    const { tenantId, fullName, email, password, phone, role = 'WATCHMAN' } = req.body
    if (!email || !password || !tenantId) {
      return res.status(400).json({ error: 'Email, password and tenantId are required' })
    }

    const hash = await bcrypt.hash(password, 12)
    const userId = uuidv4()
    await query(
      `INSERT INTO users (id, tenant_id, full_name, email, password_hash, phone, role)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, tenantId, fullName, email, hash, phone || null, role]
    )

    res.status(201).json({ message: 'User created', userId })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with that email already exists' })
    }
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// PUT /api/admin/users/:id/toggle — Toggle active state
router.put('/users/:id/toggle', async (req, res) => {
  try {
    const userId = req.params.id
    await query('UPDATE users SET active = NOT active WHERE id = $1', [userId])
    res.json({ message: 'User toggled' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle user' })
  }
})

// POST /api/admin/zones — Create a new parking zone
router.post('/zones', async (req, res) => {
  try {
    const { tenantId, zone_name, total_slots, zone_order } = req.body
    if (!tenantId || !zone_name) return res.status(400).json({ error: 'TenantId and zone name are required' })
    await query(
      `INSERT INTO parking_zones (tenant_id, zone_name, total_slots, zone_order) VALUES ($1,$2,$3,$4)`,
      [tenantId, zone_name, total_slots || 10, zone_order || 0]
    )
    res.status(201).json({ message: 'Zone created' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create zone' })
  }
})

// DELETE /api/admin/zones/:id — Delete a parking zone
router.delete('/zones/:id', async (req, res) => {
  try {
    await query('DELETE FROM parking_zones WHERE id = $1', [req.params.id])
    res.json({ message: 'Zone deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete zone' })
  }
})

module.exports = router
