-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'HOLIDAY', 'EXCUSED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "SystemEventType" AS ENUM ('IMPORT_RECEIVED', 'IMPORT_COMPLETED', 'IMPORT_FAILED', 'PARSE_ERROR', 'API_KEY_CREATED', 'API_KEY_REVOKED', 'SYSTEM_STARTUP', 'SYSTEM_SHUTDOWN', 'HEALTH_CHECK_FAILED');

-- CreateEnum
CREATE TYPE "EventSeverity" AS ENUM ('INFO', 'WARN', 'ERROR', 'CRITICAL');

-- CreateTable
CREATE TABLE "import_logs" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "parsedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "triggeredBy" TEXT NOT NULL DEFAULT 'auto',
    "notes" TEXT,

    CONSTRAINT "import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "rollNumber" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "class" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "firstPunchIn" TIMESTAMP(3),
    "lastPunchOut" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "importLogId" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawHash" TEXT NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parse_errors" (
    "id" TEXT NOT NULL,
    "importLogId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" TEXT NOT NULL,
    "errorCode" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parse_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "permissions" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_access_logs" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_events" (
    "id" TEXT NOT NULL,
    "type" "SystemEventType" NOT NULL,
    "severity" "EventSeverity" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_logs_status_idx" ON "import_logs"("status");
CREATE INDEX "import_logs_startedAt_idx" ON "import_logs"("startedAt");
CREATE UNIQUE INDEX "attendance_records_rawHash_key" ON "attendance_records"("rawHash");
CREATE INDEX "attendance_records_date_idx" ON "attendance_records"("date");
CREATE INDEX "attendance_records_studentId_idx" ON "attendance_records"("studentId");
CREATE INDEX "attendance_records_department_idx" ON "attendance_records"("department");
CREATE INDEX "attendance_records_class_idx" ON "attendance_records"("class");
CREATE INDEX "attendance_records_department_class_section_idx" ON "attendance_records"("department", "class", "section");
CREATE INDEX "attendance_records_date_department_idx" ON "attendance_records"("date", "department");
CREATE INDEX "attendance_records_date_status_idx" ON "attendance_records"("date", "status");
CREATE INDEX "parse_errors_importLogId_idx" ON "parse_errors"("importLogId");
CREATE UNIQUE INDEX "api_keys_name_key" ON "api_keys"("name");
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");
CREATE INDEX "api_access_logs_apiKeyId_idx" ON "api_access_logs"("apiKeyId");
CREATE INDEX "api_access_logs_requestedAt_idx" ON "api_access_logs"("requestedAt");
CREATE INDEX "system_events_type_idx" ON "system_events"("type");
CREATE INDEX "system_events_severity_idx" ON "system_events"("severity");
CREATE INDEX "system_events_createdAt_idx" ON "system_events"("createdAt");
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_importLogId_fkey"
    FOREIGN KEY ("importLogId") REFERENCES "import_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parse_errors" ADD CONSTRAINT "parse_errors_importLogId_fkey"
    FOREIGN KEY ("importLogId") REFERENCES "import_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "api_access_logs" ADD CONSTRAINT "api_access_logs_apiKeyId_fkey"
    FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
