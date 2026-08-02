const express = require('express')
const { query } = require('../db')
const { requireRole } = require('../middleware/auth')

const router = express.Router()

// GET /api/settings — Get tenant settings
router.get('/', async (req, res) => {
  try {
    const tenantId = req.user.tenantId
    let result = await query('SELECT * FROM settings WHERE tenant_id = $1', [tenantId])
    if (result.rows.length === 0) {
      // Auto-create default settings row for this tenant
      await query(
        `INSERT INTO settings (tenant_id, company_name, currency_symbol, total_slots, grace_period_minutes, gst_percent,
          rate_two_wheeler_first, rate_two_wheeler_per_hour, rate_four_wheeler_first, rate_four_wheeler_per_hour,
          feature_passes_enabled, zones_enabled, collect_driver_details)
         VALUES ($1, 'My Parking', '₹', 50, 5, 0, 20, 10, 40, 20, false, false, false)
         ON CONFLICT (tenant_id) DO NOTHING`,
        [tenantId]
      )
      result = await query('SELECT * FROM settings WHERE tenant_id = $1', [tenantId])
    }
    res.json({ settings: result.rows[0] })
  } catch (err) {
    console.error('[settings/GET]', err)
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
        rate_rules = COALESCE($18, rate_rules),
        feature_passes_enabled = COALESCE($19, feature_passes_enabled),
        zones_enabled = COALESCE($20, zones_enabled),
        updated_at = NOW()
       WHERE tenant_id = $21`,
      [
        s.company_name, s.address, s.phone, s.currency_symbol,
        s.total_slots, s.grace_period_minutes, s.gst_percent, s.receipt_footer,
        s.upi_id, s.upi_phone, s.upi_qr_url, s.upi_payee_name,
        s.rate_two_wheeler_first, s.rate_two_wheeler_per_hour,
        s.rate_four_wheeler_first, s.rate_four_wheeler_per_hour,
        s.collect_driver_details,
        s.rate_rules ? JSON.stringify(s.rate_rules) : null,
        s.feature_passes_enabled, s.zones_enabled,
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
