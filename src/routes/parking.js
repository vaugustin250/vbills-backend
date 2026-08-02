const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { query } = require('../db')
const { requireRole } = require('../middleware/auth')
const { calculateFee } = require('../services/rateEngine')

const router = express.Router()

// POST /api/parking/entry — Register a vehicle entering
router.post('/entry', requireRole('WATCHMAN', 'MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const vehicleNum = req.body.vehicle_number || req.body.vehicleNumber
    const vType = req.body.vehicle_type || req.body.vehicleType
    const dName = req.body.driver_name || req.body.driverName
    const dPhone = req.body.driver_phone || req.body.driverPhone
    const zoneId = req.body.zone_id || req.body.zone
    const amountPaidAtEntry = req.body.amount_paid_at_entry || 0
    const paymentMethodAtEntry = req.body.entry_payment_mode || req.body.paymentMethodAtEntry
    const syncId = req.body.id || req.body.syncId

    if (!vehicleNum || !vType) {
      return res.status(400).json({ error: 'Vehicle number and type are required' })
    }

    const tenantId = req.user.tenantId
    const id = syncId || uuidv4()
    const ticketNo = req.body.ticket_no || req.body.ticketNo || null
    const operatorName = req.body.operator_name || req.body.operatorName || req.user.full_name || 'Watchman'

    // Check if vehicle is already parked
    const existing = await query(
      `SELECT id FROM parking_records
       WHERE tenant_id = $1 AND vehicle_number = $2 AND exit_time IS NULL`,
      [tenantId, vehicleNum.toUpperCase().trim()]
    )
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'This vehicle is already inside the parking lot.' })
    }

    const result = await query(
      `INSERT INTO parking_records
       (id, tenant_id, vehicle_number, vehicle_type, driver_name, driver_phone,
        entry_time, zone, amount_paid_at_entry, payment_method_at_entry, ticket_no, operator_name)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id, tenantId,
        vehicleNum.toUpperCase().trim(), vType,
        dName || null, dPhone || null,
        zoneId || null,
        amountPaidAtEntry || 0,
        paymentMethodAtEntry || null,
        ticketNo,
        operatorName
      ]
    )

    res.status(201).json({ record: result.rows[0] })
  } catch (err) {
    console.error('[parking/entry]', err)
    res.status(500).json({ error: 'Failed to register vehicle entry' })
  }
})

// POST /api/parking/exit — Record a vehicle leaving + calculate fee
router.post('/exit', requireRole('WATCHMAN', 'MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const recordId = req.body.record_id || req.body.id || req.body.recordId
    const ticketNo = req.body.ticket_no
    const paymentMethod = req.body.payment_method || req.body.paymentMethod
    const overrideAmount = req.body.amount_charged || req.body.overrideAmount
    const tenantId = req.user.tenantId

    // Fetch record (Try ticket_no first for robust offline sync, fallback to id)
    let recResult
    if (ticketNo) {
      recResult = await query(
        `SELECT * FROM parking_records WHERE ticket_no = $1 AND tenant_id = $2 AND exit_time IS NULL`,
        [ticketNo, tenantId]
      )
    }
    
    if (!recResult || recResult.rows.length === 0) {
      recResult = await query(
        `SELECT * FROM parking_records WHERE id = $1 AND tenant_id = $2 AND exit_time IS NULL`,
        [recordId, tenantId]
      )
    }

    if (recResult.rows.length === 0) {
      return res.status(404).json({ error: 'Active parking record not found' })
    }
    const record = recResult.rows[0]

    // Fetch tenant settings for rate calculation
    const settResult = await query(
      'SELECT * FROM settings WHERE tenant_id = $1',
      [tenantId]
    )
    const settings = settResult.rows[0] || {}

    // Calculate fee using the rate engine
    const { fee, durationMinutes } = calculateFee(record, settings, new Date())
    const finalAmount = overrideAmount != null ? parseFloat(overrideAmount) : fee
    const alreadyPaid = parseFloat(record.amount_paid_at_entry) || 0
    const amountDue = Math.max(0, finalAmount - alreadyPaid)

    const updated = await query(
      `UPDATE parking_records
       SET exit_time = NOW(), amount_charged = $1, amount_paid_at_exit = $2,
           payment_method = $3, duration_minutes = $4, status = 'EXITED'
       WHERE id = $5
       RETURNING *`,
      [finalAmount, amountDue, paymentMethod || 'Cash', durationMinutes, recordId]
    )

    res.json({ record: updated.rows[0], fee: finalAmount, amountDue, durationMinutes })
  } catch (err) {
    console.error('[parking/exit]', err)
    res.status(500).json({ error: 'Failed to process vehicle exit' })
  }
})

// GET /api/parking/active — Get all currently parked vehicles
router.get('/active', requireRole('WATCHMAN', 'MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const result = await query(
      `SELECT * FROM parking_records
       WHERE tenant_id = $1 AND exit_time IS NULL
       ORDER BY entry_time DESC`,
      [tenantId]
    )
    res.json({ records: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active vehicles' })
  }
})

// GET /api/parking/lookup/:vehicleNumber — Lookup active record by vehicle number
router.get('/lookup/:vehicleNumber', requireRole('WATCHMAN', 'MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const vn = req.params.vehicleNumber.toUpperCase().trim()

    const result = await query(
      `SELECT * FROM parking_records WHERE tenant_id = $1 AND vehicle_number = $2 AND exit_time IS NULL`,
      [tenantId, vn]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active record found for this vehicle' })
    }

    // Also compute current estimated fee
    const settResult = await query('SELECT * FROM settings WHERE tenant_id = $1', [tenantId])
    const settings = settResult.rows[0] || {}
    const { fee, durationMinutes } = calculateFee(result.rows[0], settings, new Date())

    res.json({ record: result.rows[0], estimatedFee: fee, durationMinutes })
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed' })
  }
})

// POST /api/parking/sync — Offline sync: bulk insert records from local device
router.post('/sync', requireRole('WATCHMAN', 'MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const { records } = req.body // array of parking records from local DB

    if (!Array.isArray(records) || records.length === 0) {
      return res.json({ synced: 0 })
    }

    let synced = 0
    for (const r of records) {
      try {
        await query(
          `INSERT INTO parking_records
           (id, tenant_id, vehicle_number, vehicle_type, driver_name, driver_phone,
            entry_time, exit_time, zone, amount_charged, amount_paid_at_entry,
            amount_paid_at_exit, payment_method, duration_minutes, ticket_no, operator_name, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (id) DO UPDATE SET 
             exit_time = EXCLUDED.exit_time, amount_charged = EXCLUDED.amount_charged,
             amount_paid_at_exit = EXCLUDED.amount_paid_at_exit, payment_method = EXCLUDED.payment_method,
             duration_minutes = EXCLUDED.duration_minutes, status = EXCLUDED.status`,
          [
            r.id, tenantId, r.vehicleNumber || r.vehicle_number, r.vehicleType || r.vehicle_type,
            r.driverName || r.driver_name || null, r.driverPhone || r.driver_phone || null,
            r.entryTime || r.entry_time, r.exitTime || r.exit_time || null, r.zone || null,
            r.amountCharged || r.amount_charged || 0, r.amountPaidAtEntry || r.amount_paid_at_entry || 0,
            r.amountPaidAtExit || r.amount_paid_at_exit || 0, r.paymentMethod || r.payment_method || 'Cash',
            r.durationMinutes || r.duration_minutes || null,
            r.ticket_no || r.ticketNo || null,
            r.operator_name || r.operatorName || req.user.full_name || 'Watchman',
            (r.exitTime || r.exit_time) ? 'EXITED' : 'PARKED'
          ]
        )
        synced++
      } catch (syncErr) {
        // Log but continue syncing other records
        console.warn('[sync] Failed to sync record:', r.id, syncErr.message)
      }
    }

    res.json({ synced })
  } catch (err) {
    res.status(500).json({ error: 'Sync failed' })
  }
})

module.exports = router
