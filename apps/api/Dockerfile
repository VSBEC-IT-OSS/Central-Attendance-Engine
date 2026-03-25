# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/schema/package.json ./packages/schema/
COPY apps/api/package.json ./apps/api/
RUN npm ci --workspace=apps/api --workspace=packages/schema

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/schema/node_modules ./packages/schema/node_modules
COPY packages/schema ./packages/schema
COPY apps/api ./apps/api
COPY package.json ./

# Generate Prisma client & build
RUN npm run db:generate -w apps/api
RUN npm run build -w packages/schema
RUN npm run build -w apps/api

# ── Stage 3: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

COPY --from=builder --chown=appuser:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/apps/api/prisma ./prisma
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/packages ./packages

# Create file directories
RUN mkdir -p /var/attendance/incoming /var/attendance/archive && \
    chown -R appuser:nodejs /var/attendance

USER appuser
EXPOSE 3001

# Run migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
