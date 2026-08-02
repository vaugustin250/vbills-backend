const express = require('express')
const { query } = require('../db')
const { requireRole } = require('../middleware/auth')

const router = express.Router()

// GET /api/reports/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/daily', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const { from, to } = req.query

    const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const toDate = to || new Date().toISOString().slice(0, 10)

    const result = await query(
      `SELECT
        DATE(entry_time AT TIME ZONE 'UTC') AS date,
        COUNT(*) AS entries,
        COUNT(exit_time) AS exits,
        COALESCE(SUM(CASE WHEN exit_time IS NOT NULL THEN amount_charged ELSE amount_paid_at_entry END), 0) AS revenue,
        COALESCE(SUM(CASE WHEN vehicle_type IN ('2-Wheeler','Bike') THEN 1 ELSE 0 END), 0) AS two_wheelers,
        COALESCE(SUM(CASE WHEN vehicle_type IN ('4-Wheeler','Car') THEN 1 ELSE 0 END), 0) AS four_wheelers,
        COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN amount_charged
                         WHEN payment_method_at_entry = 'Cash' THEN amount_paid_at_entry ELSE 0 END), 0) AS cash,
        COALESCE(SUM(CASE WHEN payment_method = 'UPI' THEN amount_charged
                         WHEN payment_method_at_entry = 'UPI' THEN amount_paid_at_entry ELSE 0 END), 0) AS upi
       FROM parking_records
       WHERE tenant_id = $1
         AND entry_time >= $2::date
         AND entry_time < ($3::date + INTERVAL '1 day')
       GROUP BY DATE(entry_time AT TIME ZONE 'UTC')
       ORDER BY date ASC`,
      [tenantId, fromDate, toDate]
    )

    // Summary totals
    const rows = result.rows
    const summary = rows.reduce((acc, r) => {
      acc.totalRevenue += parseFloat(r.revenue) || 0
      acc.totalEntries += parseInt(r.entries) || 0
      acc.totalExits += parseInt(r.exits) || 0
      acc.totalCash += parseFloat(r.cash) || 0
      acc.totalUpi += parseFloat(r.upi) || 0
      acc.twoWheelers += parseInt(r.two_wheelers) || 0
      acc.fourWheelers += parseInt(r.four_wheelers) || 0
      return acc
    }, { totalRevenue: 0, totalEntries: 0, totalExits: 0, totalCash: 0, totalUpi: 0, twoWheelers: 0, fourWheelers: 0 })

    res.json({ data: rows, summary, from: fromDate, to: toDate })
  } catch (err) {
    console.error('[reports/daily]', err)
    res.status(500).json({ error: 'Failed to generate report' })
  }
})

// GET /api/reports/records?from=&to=&limit=&offset= — full records list with pagination
router.get('/records', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const { from, to, limit = 100, offset = 0, vehicleType, search } = req.query

    let sql = `SELECT * FROM parking_records WHERE tenant_id = $1`
    const params = [tenantId]
    let idx = 2

    if (from) { sql += ` AND entry_time >= $${idx++}::date`; params.push(from) }
    if (to) { sql += ` AND entry_time < ($${idx++}::date + INTERVAL '1 day')`; params.push(to) }
    if (vehicleType) { sql += ` AND vehicle_type = $${idx++}`; params.push(vehicleType) }
    if (search) { sql += ` AND vehicle_number ILIKE $${idx++}`; params.push(`%${search}%`) }

    sql += ` ORDER BY entry_time DESC LIMIT $${idx++} OFFSET $${idx++}`
    params.push(parseInt(limit), parseInt(offset))

    const result = await query(sql, params)
    res.json({ records: result.rows, count: result.rowCount })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch records' })
  }
})

// GET /api/reports/shifts — List shift reports
router.get('/shifts', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const result = await query(
      `SELECT * FROM shift_reports WHERE tenant_id = $1 ORDER BY end_time DESC LIMIT 30`,
      [tenantId]
    )
    res.json({ shifts: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shift reports' })
  }
})

// POST /api/reports/shift — Sync offline shift report
router.post('/shift', requireRole('WATCHMAN', 'MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const { watchman_name, start_time, end_time, vehicles_in, vehicles_out, revenue_cash, revenue_upi, revenue_total } = req.body

    await query(
      `INSERT INTO shift_reports 
       (tenant_id, watchman_name, start_time, end_time, vehicles_in, vehicles_out, revenue_cash, revenue_upi, revenue_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [tenantId, watchman_name, start_time, end_time, vehicles_in, vehicles_out, revenue_cash, revenue_upi, revenue_total]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('[reports/shift]', err)
    res.status(500).json({ error: 'Failed to save shift report' })
  }
})

module.exports = router
