const express = require('express')
const { query } = require('../db')
const { requireRole } = require('../middleware/auth')

const router = express.Router()

// GET /api/settings — Get tenant settings
router.get('/', async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const result = await query('SELECT * FROM settings WHERE tenant_id = $1', [tenantId])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Settings not found' })
    }
    res.json({ settings: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' })
  }
})

// PUT /api/settings — Update tenant settings (MANAGER only)
router.put('/', requireRole('MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    const s = req.body

    await query(
      `UPDATE settings SET
        company_name = COALESCE($1, company_name),
        address = COALESCE($2, address),
        phone = COALESCE($3, phone),
        currency_symbol = COALESCE($4, currency_symbol),
        total_slots = COALESCE($5, total_slots),
        grace_period_minutes = COALESCE($6, grace_period_minutes),
        gst_percent = COALESCE($7, gst_percent),
        receipt_footer = COALESCE($8, receipt_footer),
        upi_id = COALESCE($9, upi_id),
        upi_phone = COALESCE($10, upi_phone),
        upi_qr_url = COALESCE($11, upi_qr_url),
        upi_payee_name = COALESCE($12, upi_payee_name),
        rate_two_wheeler_first = COALESCE($13, rate_two_wheeler_first),
        rate_two_wheeler_per_hour = COALESCE($14, rate_two_wheeler_per_hour),
        rate_four_wheeler_first = COALESCE($15, rate_four_wheeler_first),
        rate_four_wheeler_per_hour = COALESCE($16, rate_four_wheeler_per_hour),
        collect_driver_details = COALESCE($17, collect_driver_details),
        updated_at = NOW()
       WHERE tenant_id = $18`,
      [
        s.company_name, s.address, s.phone, s.currency_symbol,
        s.total_slots, s.grace_period_minutes, s.gst_percent, s.receipt_footer,
        s.upi_id, s.upi_phone, s.upi_qr_url, s.upi_payee_name,
        s.rate_two_wheeler_first, s.rate_two_wheeler_per_hour,
        s.rate_four_wheeler_first, s.rate_four_wheeler_per_hour,
        s.collect_driver_details,
        tenantId
      ]
    )

    const result = await query('SELECT * FROM settings WHERE tenant_id = $1', [tenantId])
    res.json({ settings: result.rows[0] })
  } catch (err) {
    console.error('[settings/PUT]', err)
    res.status(500).json({ error: 'Failed to update settings' })
  }
})

module.exports = router
