-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('OK', 'ERROR');

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "backupEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "backupLastAt" TIMESTAMP(3),
ADD COLUMN     "backupLastError" TEXT,
ADD COLUMN     "backupLastStatus" "BackupStatus";
