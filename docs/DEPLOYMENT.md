# Deployment Guide

This guide walks through deploying AttendanceEngine on a fresh Linux VPS.
Total cost: **₹400–700/month** on providers like Hetzner, DigitalOcean, or AWS Lightsail.

---

## Recommended VPS specs (minimum)

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Disk | 20 GB SSD | 40 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

**Cheap options:**
- Hetzner CX11: ~€3.79/month (~₹340) — excellent for this workload
- DigitalOcean Basic Droplet: $6/month (~₹500)
- AWS Lightsail 1GB: $5/month (~₹420)

---

## Step 1 — Initial server setup

SSH into your fresh VPS as root, then:

```bash
# Create a non-root user
adduser deploy
usermod -aG sudo deploy

# Copy your SSH key to the new user
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# Switch to the deploy user for everything from here
su - deploy
```

---

## Step 2 — Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# Log out and back in for the group change to apply
exit
# SSH back in as deploy

# Verify
docker --version          # Docker 25.x.x
docker compose version    # Docker Compose v2.x.x
```

---

## Step 3 — Clone the repository

```bash
sudo mkdir -p /opt/attendance-engine
sudo chown deploy:deploy /opt/attendance-engine
cd /opt/attendance-engine

# Org repo
git clone https://github.com/YOUR_ORG/attendance-engine.git .

# Or your personal fork
git clone https://github.com/YOUR_USERNAME/attendance-engine.git .
```

---

## Step 4 — Configure environment

```bash
cp .env.example .env
nano .env
```

Fill in **every value**. Critical ones:

```env
# Strong random strings — generate with: openssl rand -hex 32
JWT_SECRET=<64-char-random-string>
INGEST_SECRET=<32-char-random-string>
POSTGRES_PASSWORD=<strong-db-password>
REDIS_PASSWORD=<strong-redis-password>

# Your domain or VPS IP
DASHBOARD_ORIGIN=https://your-domain.com

# Admin account
ADMIN_EMAIL=your@email.com
ADMIN_PASSWORD=<strong-password-change-after-first-login>
```

---

## Step 5 — Build and start

```bash
# Build all containers
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start in detached mode
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Watch logs
docker compose logs -f api
```

---

## Step 6 — Run database migrations and seed

```bash
# Run migrations
docker compose exec api npx prisma migrate deploy

# Seed initial admin user and demo API keys
docker compose exec api node dist/config/seed.js
```

The seed output will print the initial API keys — **save them now**.

---

## Step 7 — Verify everything is running

```bash
# All containers should be "Up"
docker compose ps

# Health check
curl http://localhost:3001/health
# Expected: {"status":"ok","version":"1.0.0","ts":"..."}

# Dashboard
curl http://localhost
# Expected: HTML page
```

---

## Step 8 — Point a domain (optional but recommended)

1. Add an **A record** pointing `your-domain.com` to your VPS IP at your DNS provider.
2. Wait for DNS propagation (up to 24h, usually <5 min).
3. Install Certbot for free SSL:

```bash
# Install certbot
sudo apt update && sudo apt install -y certbot

# Get certificate (stop nginx briefly)
docker compose stop dashboard
sudo certbot certonly --standalone -d your-domain.com

# Copy certs to nginx volume
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/certs/
sudo chown deploy:deploy nginx/certs/*

# Uncomment the SSL blocks in nginx/nginx.conf
nano nginx/nginx.conf
# Uncomment: listen 443 ssl; ssl_certificate lines; HTTP→HTTPS redirect block

# Restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d dashboard
```

4. Auto-renew certs with a cron job:
```bash
crontab -e
# Add:
0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/your-domain.com/*.pem /opt/attendance-engine/nginx/certs/ && docker compose -C /opt/attendance-engine restart dashboard
```

---

## Step 9 — Configure the aggregator server to push files

On the aggregator server, add a daily cron or webhook that POSTs xlsx files:

```bash
# Example curl command (add to aggregator's cron)
curl -X POST https://your-domain.com/api/v1/ingest/upload \
  -H "X-Ingest-Secret: YOUR_INGEST_SECRET" \
  -F "file=@/path/to/attendance_$(date +%Y-%m-%d).xlsx"
```

Or use the file-drop method: copy files directly to the VPS at
`/var/attendance/incoming/` via SFTP — the file watcher picks them up automatically.

---

## Step 10 — Set up GitHub Actions auto-deploy

In your GitHub repo → Settings → Secrets and variables → Actions, add:

| Secret | Value |
|---|---|
| `VPS_HOST` | Your VPS IP or domain |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Contents of your `~/.ssh/id_rsa` (private key) |

Now every push to `main` automatically deploys. Monitor under Actions tab.

---

## Ongoing operations

### View logs
```bash
docker compose logs -f api          # API logs
docker compose logs -f postgres     # DB logs
docker compose logs --tail=100 api  # Last 100 lines
```

### Update to latest version
```bash
cd /opt/attendance-engine
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Backup the database
```bash
# Dump
docker compose exec postgres pg_dump -U attendance attendance_engine > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T postgres psql -U attendance attendance_engine < backup_20240315.sql
```

Add to cron for automated daily backups:
```bash
0 2 * * * cd /opt/attendance-engine && docker compose exec -T postgres pg_dump -U attendance attendance_engine > /opt/backups/attendance_$(date +\%Y\%m\%d).sql
```

### Scale up later
When the institution grows and you need more resources:
1. Upgrade your VPS plan (no code changes needed)
2. For high availability: move Postgres to managed DB (Supabase free tier, Neon, Railway)
3. For heavy load: add a Redis Cloud free tier instead of self-hosted Redis

---

## Troubleshooting

**API container keeps restarting**
```bash
docker compose logs api | tail -50
# Usually a missing .env variable or database not ready yet
```

**"relation does not exist" DB error**
```bash
docker compose exec api npx prisma migrate deploy
```

**File watcher not picking up xlsx files**
```bash
# Check the watch directory is mounted
docker compose exec api ls /var/attendance/incoming
# Check worker is running
docker compose exec api wget -qO- http://localhost:3001/health
```

**Dashboard shows "disconnected" WebSocket**
- Check nginx `/ws` proxy block is uncommented
- Check `DASHBOARD_ORIGIN` in `.env` matches your actual domain
