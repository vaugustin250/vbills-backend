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

// POST /api/admin/tenants — Create a new company + manager account
router.post('/tenants', async (req, res) => {
  try {
    const {
      businessName, email, phone, address, city, state,
      managerName, managerEmail, managerPassword,
      licenseStatus = 'TRIAL', totalSlots = 50
    } = req.body

    if (!businessName || !managerEmail || !managerPassword) {
      return res.status(400).json({ error: 'Business name, manager email and password are required' })
    }

    const tenantId = uuidv4()
    const managerId = uuidv4()

    // Create tenant
    await query(
      `INSERT INTO tenants (id, business_name, email, phone, address, city, state, license_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, businessName, email, phone, address, city, state, licenseStatus]
    )

    // Create default settings
    await query(
      `INSERT INTO settings (tenant_id, company_name, total_slots) VALUES ($1,$2,$3)`,
      [tenantId, businessName, totalSlots]
    )

    // Create manager account
    const hash = await bcrypt.hash(managerPassword, 12)
    await query(
      `INSERT INTO users (id, tenant_id, full_name, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,'MANAGER')`,
      [managerId, tenantId, managerName || businessName, managerEmail, hash]
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

module.exports = router
