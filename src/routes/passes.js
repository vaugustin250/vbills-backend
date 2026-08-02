const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { query } = require('../db')
const { requireRole } = require('../middleware/auth')

const router = express.Router()

// GET /api/passes — List all passes
router.get('/', requireRole('WATCHMAN', 'MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const result = await query(
      `SELECT * FROM parking_passes WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    )
    res.json({ passes: result.rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB Error (GET): ' + err.message })
  }
})

// POST /api/passes — Create a new pass
router.post('/', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const id = uuidv4()
    const p = req.body

    await query(
      `INSERT INTO parking_passes (id, tenant_id, pass_number, pass_type, holder_name, vehicle_number, phone, valid_from, valid_until, max_entries, price_charged, qr_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id, tenantId, p.pass_number, p.pass_type, p.holder_name, p.vehicle_number,
        p.phone || null, p.valid_from, p.valid_until,
        p.max_entries || null, p.price_charged || null, p.qr_code || null, 'ACTIVE'
      ]
    )

    res.status(201).json({ id })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB Error: ' + err.message })
  }
})

// PUT /api/passes/:id/renew — Renew a pass
router.put('/:id/renew', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const { id } = req.params
    const { valid_from, valid_until } = req.body

    await query(
      `UPDATE parking_passes SET valid_from = $1, valid_until = $2, status = 'ACTIVE', updated_at = NOW() WHERE id = $3 AND tenant_id = $4`,
      [valid_from, valid_until, id, tenantId]
    )

    res.json({ message: 'Pass renewed' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to renew pass' })
  }
})

module.exports = router
