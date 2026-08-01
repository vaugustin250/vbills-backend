const express = require('express')
const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')
const { query } = require('../db')
const { requireRole } = require('../middleware/auth')

const router = express.Router()

// GET /api/staff — List all staff for the manager's tenant
router.get('/', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const result = await query(
      `SELECT id, full_name, email, phone, role, active, created_at, last_login
       FROM users WHERE tenant_id = $1 ORDER BY role, full_name`,
      [tenantId]
    )
    res.json({ staff: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff' })
  }
})

// POST /api/staff — Create a new staff member
router.post('/', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const { full_name, email, password, phone, role = 'WATCHMAN' } = req.body

    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, password and full name are required' })
    }

    const hash = await bcrypt.hash(password, 12)
    const userId = uuidv4()
    await query(
      `INSERT INTO users (id, tenant_id, full_name, email, password_hash, phone, role)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, tenantId, full_name, email.toLowerCase(), hash, phone || null, role]
    )

    res.status(201).json({ message: 'Staff created', id: userId })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with that email already exists' })
    }
    console.error(err)
    res.status(500).json({ error: 'Failed to create staff' })
  }
})

// PUT /api/staff/:id — Update a staff member
router.put('/:id', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const { id } = req.params
    const { full_name, phone, role, active, password } = req.body

    let updateQuery = `UPDATE users SET full_name = $1, phone = $2, role = $3, active = $4`
    let params = [full_name, phone || null, role, active]
    
    if (password) {
      const hash = await bcrypt.hash(password, 12)
      updateQuery += `, password_hash = $5 WHERE id = $6 AND tenant_id = $7`
      params.push(hash, id, tenantId)
    } else {
      updateQuery += ` WHERE id = $5 AND tenant_id = $6`
      params.push(id, tenantId)
    }

    await query(updateQuery, params)
    res.json({ message: 'Staff updated' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update staff' })
  }
})

// DELETE /api/staff/:id — Delete a staff member
router.delete('/:id', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const { id } = req.params
    
    // Prevent deleting oneself
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' })
    }

    await query(`DELETE FROM users WHERE id = $1 AND tenant_id = $2`, [id, tenantId])
    res.json({ message: 'Staff deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete staff' })
  }
})

module.exports = router
