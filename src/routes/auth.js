const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { query } = require('../db')
const { generateTokens } = require('../middleware/auth')

const router = express.Router()

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // Fetch user + their tenant info
    const result = await query(
      `SELECT u.*, t.license_status, t.business_name, t.feature_passes_allowed, t.feature_zones_allowed
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 AND u.active = true`,
      [email.toLowerCase().trim()]
    )

    const user = result.rows[0]
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Check license for non-super admins
    if (user.role !== 'SUPER_ADMIN' && user.license_status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Your account has been suspended. Contact support.' })
    }

    // Verify password
    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id])

    const { accessToken, refreshToken } = generateTokens(user)

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        tenantId: user.tenant_id,
        businessName: user.business_name,
        tenantData: {
          feature_passes_allowed: user.feature_passes_allowed || false,
          feature_zones_allowed: user.feature_zones_allowed || false
        }
      }
    })
  } catch (err) {
    console.error('[auth/login]', err)
    res.status(500).json({ error: 'Login failed. Please try again.' })
  }
})

// POST /api/auth/refresh — get new access token using refresh token
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' })

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
    const result = await query('SELECT * FROM users WHERE id = $1 AND active = true', [payload.id])
    const user = result.rows[0]
    if (!user) return res.status(401).json({ error: 'User not found or deactivated' })

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user)
    res.json({ accessToken, refreshToken: newRefreshToken })
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired refresh token' })
  }
})

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' })
  const token = authHeader.split(' ')[1]

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const { currentPassword, newPassword } = req.body

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' })
    }

    const result = await query('SELECT * FROM users WHERE id = $1', [payload.id])
    const user = result.rows[0]
    const match = await bcrypt.compare(currentPassword, user.password_hash)
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' })

    const hash = await bcrypt.hash(newPassword, 12)
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, payload.id])
    res.json({ message: 'Password updated successfully' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' })
  }
})

module.exports = router
