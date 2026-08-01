const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { query } = require('../db')
const { requireRole } = require('../middleware/auth')

const router = express.Router()

// GET /api/zones — List all zones and their occupancy
router.get('/', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const zonesResult = await query(
      `SELECT * FROM parking_zones WHERE tenant_id = $1 ORDER BY zone_order`,
      [tenantId]
    )
    
    const recordsResult = await query(
      `SELECT zone_id, slot_no FROM parking_records WHERE tenant_id = $1 AND status = 'PARKED' AND zone_id IS NOT NULL`,
      [tenantId]
    )

    const occupancy = {}
    for (const r of recordsResult.rows) {
      if (!occupancy[r.zone_id]) occupancy[r.zone_id] = { count: 0, slots: [] }
      occupancy[r.zone_id].count++
      if (r.slot_no) occupancy[r.zone_id].slots.push(r.slot_no)
    }

    res.json({ zones: zonesResult.rows, occupancy })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch zones' })
  }
})

// POST /api/zones — Create a new zone
router.post('/', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const id = uuidv4()
    const { zone_name, total_slots, color, description, slot_diagram_enabled, rows_count, cols_count, active, zone_order } = req.body

    await query(
      `INSERT INTO parking_zones (id, tenant_id, zone_name, total_slots, color, description, slot_diagram_enabled, rows_count, cols_count, active, zone_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, tenantId, zone_name, total_slots, color || '#6366f1', description || null, slot_diagram_enabled || false, rows_count || null, cols_count || null, active !== false, zone_order || 0]
    )

    res.status(201).json({ id })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create zone' })
  }
})

// PUT /api/zones/:id — Update a zone
router.put('/:id', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const { id } = req.params
    const { zone_name, total_slots, color, description, slot_diagram_enabled, rows_count, cols_count, active, zone_order } = req.body

    await query(
      `UPDATE parking_zones SET zone_name = $1, total_slots = $2, color = $3, description = $4, slot_diagram_enabled = $5, rows_count = $6, cols_count = $7, active = $8, zone_order = $9 WHERE id = $10 AND tenant_id = $11`,
      [zone_name, total_slots, color, description, slot_diagram_enabled, rows_count, cols_count, active, zone_order, id, tenantId]
    )

    res.json({ message: 'Zone updated' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update zone' })
  }
})

// DELETE /api/zones/:id — Delete a zone
router.delete('/:id', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const { id } = req.params
    
    await query(`DELETE FROM parking_zones WHERE id = $1 AND tenant_id = $2`, [id, tenantId])
    res.json({ message: 'Zone deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete zone' })
  }
})

module.exports = router
