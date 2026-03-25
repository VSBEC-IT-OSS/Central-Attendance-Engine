# GitHub Setup Guide

## Part 1 — Org repository

### Create the org repo

1. Go to your college's GitHub organisation (create one if it doesn't exist: github.com/organizations/new)
2. New repository → name: `attendance-engine`
3. Description: `Self-hosted student attendance data pipeline — ingest, normalise, serve`
4. Public ✓ (open source)
5. Do NOT initialise with README (we have one)

### Push the code

```bash
cd attendance-engine
git init
git add .
git commit -m "feat: initial release v1.0.0

Self-hosted attendance data pipeline.
- xlsx ingestion via HTTP push and file watcher
- Pluggable parser adapter system
- REST + WebSocket API with JWT and API key auth
- React admin dashboard
- Docker Compose deployment"

git remote add origin https://github.com/YOUR_ORG/attendance-engine.git
git branch -M main
git push -u origin main
```

### Configure branch protection (do this in GitHub UI)

Settings → Branches → Add branch protection rule for `main`:
- ✓ Require a pull request before merging
- ✓ Require status checks to pass before merging
  - Select: `Lint & Typecheck`, `Unit Tests`, `Build`
- ✓ Require branches to be up to date before merging
- ✓ Do not allow bypassing the above settings

### Add repository topics (for discoverability)

In the repo homepage, click the gear next to "About":
```
attendance  biometric  nodejs  typescript  fastify  postgresql  docker  self-hosted  education  open-source
```

### Configure secrets for CI/CD

Settings → Secrets and variables → Actions:

| Name | Value |
|---|---|
| `VPS_HOST` | Your VPS IP address or domain |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Your SSH private key (`cat ~/.ssh/id_rsa`) |

---

## Part 2 — Your personal fork

### Fork the org repo

1. On the org repo page, click **Fork**
2. Fork to your personal account
3. Clone your fork locally for development:

```bash
git clone https://github.com/YOUR_USERNAME/attendance-engine.git
cd attendance-engine

# Add org repo as upstream
git remote add upstream https://github.com/YOUR_ORG/attendance-engine.git

# Verify remotes
git remote -v
# origin    https://github.com/YOUR_USERNAME/attendance-engine.git (fetch)
# origin    https://github.com/YOUR_USERNAME/attendance-engine.git (push)
# upstream  https://github.com/YOUR_ORG/attendance-engine.git (fetch)
# upstream  https://github.com/YOUR_ORG/attendance-engine.git (push)
```

### Development workflow

```bash
# Always branch from main
git checkout main
git pull upstream main
git checkout -b feat/your-feature

# Make changes, commit
git add .
git commit -m "feat: describe your change"

# Push to your fork
git push origin feat/your-feature

# Open a PR from your fork to the org repo on GitHub
```

### Keep your fork up to date

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

---

## Part 3 — Portfolio presentation

### Pin the fork on your profile

1. Go to your GitHub profile
2. Click "Customize your pins"
3. Select `attendance-engine`

### Add a portfolio note to your fork's README

At the top of your fork's `README.md`, add a callout:

```markdown
> **Portfolio project** — built as infrastructure for [College Name]'s biometric
> attendance system. The canonical open-source version lives at
> [college-org/attendance-engine](https://github.com/YOUR_ORG/attendance-engine).
> This fork is where I do active development and experimentation.
```

### Set up a live demo (optional but impressive)

Deploy to a free-tier service for portfolio demos:
- **Railway** (railway.app) — free tier, supports Postgres + Redis + Node
- **Render** (render.com) — free tier with some sleep limitations

Point the repo's "Website" field to your live demo URL.

### What to highlight when talking about this project

1. **Problem**: Biometric data is stuck in proprietary formats — no way for other apps to use it
2. **Solution**: A data pipeline that normalises any xlsx format and serves a clean API
3. **Technical decisions to discuss**:
   - Why pluggable adapters instead of a fixed parser (future-proofing)
   - Why idempotent imports (reliability, re-runnable)
   - Why BullMQ for the job queue (reliability, retry, observability)
   - Why separate API keys per consumer (security, audit trail)
4. **Scale story**: Currently runs on ₹400/month VPS, architecture is ready to move to cloud with zero code changes

---

## Commit message convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add SFTP polling as an alternative ingest method
fix: handle xlsx files with merged header cells
docs: add example for WhatsApp bot integration
chore: upgrade Prisma to v5.12
refactor: extract date parsing into shared utility
test: add adapter tests for ERP-format xlsx
```
