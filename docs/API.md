# AttendanceEngine — API Reference

Base URL: `https://your-domain/api/v1`

All responses follow the envelope format:
```json
{ "success": true, "data": <payload>, "meta": <pagination?> }
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human message" } }
```

---

## Authentication

### Dashboard (Admin UI)
Use JWT Bearer token in the `Authorization` header.

```
Authorization: Bearer <jwt_token>
```

Obtain a token via `POST /auth/login`.

### Consumer Apps (bots, dashboards, scripts)
Use an API key in the `X-API-Key` header. Keys are created from the admin dashboard.

```
X-API-Key: ae_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Ingest endpoint (aggregator server)
Uses a separate shared secret header:
```
X-Ingest-Secret: <your_ingest_secret_from_.env>
```

---

## Auth Routes

### `POST /auth/login`
Authenticate as an admin user. Returns a JWT.

**Body:**
```json
{ "email": "admin@college.edu", "password": "yourpassword" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJ...",
    "name": "System Admin",
    "email": "admin@college.edu"
  }
}
```

### `GET /auth/me`
Returns the currently authenticated admin user. Requires JWT.

---

## Ingest Routes

### `POST /ingest/upload`
Push a daily `.xlsx` file from the aggregator server. Requires `X-Ingest-Secret`.

**Request:** `multipart/form-data` with field `file` containing the xlsx.

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "File received and queued for processing",
    "filename": "attendance_2024-03-15.xlsx",
    "jobId": "attendance_2024-03-15.xlsx-1710499200000"
  }
}
```

The file is processed asynchronously. Monitor progress via WebSocket or import logs.

### `POST /ingest/trigger`
Manually trigger import of a file already on the server filesystem. Requires `X-Ingest-Secret`.

**Body:**
```json
{ "filepath": "/var/attendance/incoming/file.xlsx", "filename": "file.xlsx" }
```

---

## Attendance Routes

All routes require `X-API-Key` or JWT. API keys need `attendance:read` permission.

### `GET /attendance`
Paginated list of attendance records with filters.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `date` | `YYYY-MM-DD` | Filter by exact date |
| `dateFrom` | `YYYY-MM-DD` | Range start |
| `dateTo` | `YYYY-MM-DD` | Range end |
| `department` | string | e.g. `CSE` |
| `class` | string | e.g. `III Year` |
| `section` | string | e.g. `A` |
| `studentId` | string | Exact match |
| `status` | enum | `PRESENT\|ABSENT\|LATE\|HALF_DAY\|HOLIDAY\|EXCUSED` |
| `page` | number | Default `1` |
| `limit` | number | Default `50`, max `200` |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "studentId": "CS21001",
      "studentName": "Arun Kumar",
      "rollNumber": "CS21001",
      "department": "CSE",
      "className": "III Year",
      "section": "A",
      "date": "2024-03-15T00:00:00.000Z",
      "firstPunchIn": "2024-03-15T03:32:00.000Z",
      "lastPunchOut": "2024-03-15T11:15:00.000Z",
      "status": "PRESENT",
      "sourceFile": "import-log-uuid",
      "importedAt": "2024-03-15T18:00:00.000Z",
      "rawHash": "sha256hash"
    }
  ],
  "meta": { "page": 1, "limit": 50, "total": 320, "totalPages": 7 }
}
```

### `GET /attendance/:id`
Single attendance record by ID.

### `GET /attendance/student/:studentId`
All records for a student. Supports `dateFrom` / `dateTo` query params and pagination.

### `GET /attendance/absentees/today`
Today's absent students grouped by class/section. Designed for WhatsApp bot consumption.

**Query params:** `department`, `class`, `section` (all optional filters)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-03-15",
      "department": "CSE",
      "class": "III Year",
      "section": "A",
      "absentees": [
        { "studentId": "CS21042", "studentName": "Priya Sharma", "rollNumber": "CS21042" },
        { "studentId": "CS21078", "studentName": "Rahul Singh", "rollNumber": "CS21078" }
      ]
    }
  ]
}
```

### `GET /attendance/absentees/date/:date`
Same as above but for any historical date (`YYYY-MM-DD`).

---

## Summary Routes

All routes require `X-API-Key` or JWT. API keys need `summary:read` permission.

### `GET /summary/overview`
Top-level attendance numbers for a single day.

**Query params:** `date` (defaults to today)

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2024-03-15",
    "total": 1240,
    "PRESENT": 1050,
    "ABSENT": 120,
    "LATE": 45,
    "HALF_DAY": 12,
    "HOLIDAY": 0,
    "EXCUSED": 13,
    "attendancePercent": 88.3,
    "departmentsReported": 6,
    "lastImport": {
      "status": "SUCCESS",
      "startedAt": "2024-03-15T17:00:00.000Z",
      "parsedRows": 1240,
      "errorRows": 0
    }
  }
}
```

### `GET /summary/department`
Per-department breakdown for a day.

**Query params:** `date`

### `GET /summary/class`
Per-class/section breakdown.

**Query params:** `date`, `department`

### `GET /summary/student/:studentId`
Individual student attendance summary over a date range.

**Query params:** `dateFrom`, `dateTo`

**Response:**
```json
{
  "success": true,
  "data": {
    "studentId": "CS21001",
    "studentName": "Arun Kumar",
    "rollNumber": "CS21001",
    "department": "CSE",
    "className": "III Year",
    "section": "A",
    "dateFrom": "2024-02-15",
    "dateTo": "2024-03-15",
    "totalDays": 22,
    "PRESENT": 18,
    "ABSENT": 2,
    "LATE": 1,
    "HALF_DAY": 1,
    "HOLIDAY": 0,
    "EXCUSED": 0,
    "attendancePercent": 86.4
  }
}
```

### `GET /summary/trend`
Daily attendance percentages over N days. Used for trend charts.

**Query params:** `days` (default `30`, max `365`), `department`, `class`

---

## Admin Routes

All admin routes require JWT (dashboard login only).

### `GET /admin/health`
System health check.

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "uptime": 86400,
    "database": "connected",
    "redis": "connected",
    "queueDepth": 0,
    "lastImportAt": "2024-03-15T17:00:00.000Z",
    "lastImportStatus": "SUCCESS"
  }
}
```

### `GET /admin/imports`
Paginated import log. Supports `?status=FAILED` filter.

### `GET /admin/imports/:id`
Single import log with all row-level parse errors.

### `POST /admin/imports/:id/retry`
Flag a failed import for retry (re-upload required).

### `GET /admin/parse-errors`
All parse errors across all imports, paginated.

### `GET /admin/events`
System event log. Supports `?severity=ERROR` and `?type=IMPORT_FAILED`.

### `GET /admin/api-keys`
List all API keys (hashes never exposed, only prefix).

### `POST /admin/api-keys`
Create a new API key. **The raw key is returned once and never stored.**

**Body:**
```json
{
  "name": "whatsapp-bot",
  "permissions": ["attendance:read", "summary:read"]
}
```

**Response includes `key` field — store it immediately.**

### `DELETE /admin/api-keys/:id`
Revoke an API key.

### `GET /admin/meta/departments`
List of all departments that have attendance data.

### `GET /admin/meta/classes`
List of all department/class/section combinations. Supports `?department=CSE`.

---

## WebSocket

Connect to `ws://your-domain/ws` to receive real-time import events.

**Events:**
```json
{ "event": "IMPORT_STARTED",   "payload": { "importLogId": "...", "filename": "...", "processedRows": 0,   "totalRows": 0,    "percent": 0   }, "timestamp": "..." }
{ "event": "IMPORT_PROGRESS",  "payload": { "importLogId": "...", "filename": "...", "processedRows": 500, "totalRows": 1200, "percent": 41  }, "timestamp": "..." }
{ "event": "IMPORT_COMPLETED", "payload": { "importLogId": "...", "filename": "...", "processedRows": 1200,"totalRows": 1200, "percent": 100 }, "timestamp": "..." }
{ "event": "IMPORT_FAILED",    "payload": { "importLogId": "...", "filename": "...", "processedRows": 0,   "totalRows": 0,    "percent": 0   }, "timestamp": "..." }
```

---

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid token / API key |
| `INVALID_API_KEY` | 401 | API key does not exist or is revoked |
| `FORBIDDEN` | 403 | API key lacks required permission |
| `NOT_FOUND` | 404 | Resource does not exist |
| `BAD_REQUEST` | 400 | Invalid query params or body |
| `DUPLICATE_NAME` | 409 | API key name already exists |
| `INVALID_FILE_TYPE` | 400 | Uploaded file is not xlsx/xls |
| `NO_FILE` | 400 | Multipart request missing file field |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Rate Limits

Default: **100 requests per minute** per IP address. Returns `429` when exceeded.
The ingest endpoint has a stricter limit: **10 requests per minute**.

Configure via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` in `.env`.
