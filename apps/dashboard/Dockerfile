# ── Stage 1: build React app ─────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/schema/package.json ./packages/schema/
COPY apps/dashboard/package.json ./apps/dashboard/
RUN npm ci --workspace=apps/dashboard --workspace=packages/schema

COPY packages/schema ./packages/schema
COPY apps/dashboard ./apps/dashboard
RUN npm run build -w packages/schema
RUN npm run build -w apps/dashboard

# ── Stage 2: nginx ────────────────────────────────────────────────────────────
FROM nginx:alpine AS runner
COPY --from=builder /app/apps/dashboard/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
