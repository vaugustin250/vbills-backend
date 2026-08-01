require('dotenv').config()
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const { rateLimit } = require('express-rate-limit')

const authRoutes = require('./routes/auth')
const parkingRoutes = require('./routes/parking')
const reportsRoutes = require('./routes/reports')
const settingsRoutes = require('./routes/settings')
const adminRoutes = require('./routes/admin')
const { authMiddleware } = require('./middleware/auth')

const app = express()
const PORT = process.env.PORT || 4000

// ── Security Middleware ────────────────────────────────────────
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

// Global rate limiter — protects against DDoS / brute force
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
})

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
})

app.use(globalLimiter)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// ── Health Check ───────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'VBills API', version: '1.0.0', timestamp: new Date().toISOString() })
})

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/parking', authMiddleware, parkingRoutes)
app.use('/api/reports', authMiddleware, reportsRoutes)
app.use('/api/settings', authMiddleware, settingsRoutes)
app.use('/api/admin', authMiddleware, adminRoutes)

// ── 404 Handler ────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

// ── Global Error Handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

// ── Start Server ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ VBills API running on http://localhost:${PORT}`)
  console.log(`   Environment: ${process.env.NODE_ENV}`)
})
