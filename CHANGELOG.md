# Changelog

All notable changes to AttendanceEngine are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2024-03

### Added
- Initial release
- xlsx ingestion via HTTP push (`POST /api/v1/ingest/upload`) and file-system watcher
- Pluggable parser adapter system with `DefaultBiometricAdapter`
- Idempotent import pipeline with SHA-256 deduplication
- Full import audit trail (ImportLog, ParseError tables)
- REST API: attendance records, absentee lists, department/class/student summaries, trends
- JWT authentication for admin dashboard
- API key system for consumer apps (scoped permissions)
- BullMQ job queue with exponential retry
- WebSocket real-time import progress
- React admin dashboard: overview, import logs, parse errors, API key management, system events
- Docker Compose deployment (Postgres 16 + Redis 7 + API + nginx)
- GitHub Actions CI (lint, typecheck, test, build)
- GitHub Actions auto-deploy to VPS
