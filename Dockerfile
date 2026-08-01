# ── Build stage ──────────────────────────────────────────────────
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# ── Production stage ──────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S vbills && adduser -S vbills -u 1001

COPY --from=base /app /app

# Change ownership to non-root user
RUN chown -R vbills:vbills /app
USER vbills

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
