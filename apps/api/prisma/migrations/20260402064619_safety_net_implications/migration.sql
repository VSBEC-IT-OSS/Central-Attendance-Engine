-- DropForeignKey
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_importLogId_fkey";

-- DropForeignKey
ALTER TABLE "parse_errors" DROP CONSTRAINT "parse_errors_importLogId_fkey";

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_importLogId_fkey" FOREIGN KEY ("importLogId") REFERENCES "import_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_errors" ADD CONSTRAINT "parse_errors_importLogId_fkey" FOREIGN KEY ("importLogId") REFERENCES "import_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
