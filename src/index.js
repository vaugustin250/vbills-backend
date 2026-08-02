require('dotenv').config()
const express = require('express')
const path = require('path')
const helmet = require('helmet')
const cors = require('cors')
const { rateLimit } = require('express-rate-limit')

const authRoutes = require('./routes/auth')
const parkingRoutes = require('./routes/parking')
const reportsRoutes = require('./routes/reports')
const settingsRoutes = require('./routes/settings')
const adminRoutes = require('./routes/admin')
const staffRoutes = require('./routes/staff')
const zonesRoutes = require('./routes/zones')
const passesRoutes = require('./routes/passes')
const { authMiddleware } = require('./middleware/auth')

const app = express()
const PORT = process.env.PORT || 4000

// ── Security Middleware ────────────────────────────────────────
app.use(helmet({
  hsts: false, // Don't force HTTPS since we are testing on raw IP
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false
}))
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, same-origin)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin.startsWith('http://localhost:')) return callback(null, true);
    
    // Allow any vercel.app deployment
    if (origin.endsWith('.vercel.app')) return callback(null, true);

    // Allow the server's own IP on any port (for AWS self-hosted frontend)
    const serverIp = process.env.SERVER_IP || '13.51.56.10';
    if (origin.includes(serverIp)) return callback(null, true);
    
    // Check against FRONTEND_URL environment variable (comma-separated list)
    const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    
    callback(new Error('Not allowed by CORS'));
  },
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
app.use('/api/staff', authMiddleware, staffRoutes)
app.use('/api/zones', authMiddleware, zonesRoutes)
app.use('/api/passes', authMiddleware, passesRoutes)

// ── Serve Frontend (Static) ────────────────────────────────────
// In production on AWS, the frontend is built in ~/parkease-web/dist
// On local dev, the frontend is served by Vite dev server separately
const frontendDist = process.env.FRONTEND_DIST_PATH || path.join(__dirname, '../../parkease-web/dist')
const fs = require('fs')
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist))
  // React Router fallback — serve index.html for all non-API routes
  app.get(/^(.*)$/, (req, res) => {
    const indexPath = path.join(frontendDist, 'index.html')
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath)
    } else {
      res.status(404).json({ error: 'Frontend not built. Run npm run build in parkease-web.' })
    }
  })
} else {
  // No built frontend — API-only mode
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }))
  app.use((req, res) => res.status(200).json({ status: 'VBills API is running', tip: 'Frontend not deployed on this server.' }))
}

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
