-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramActivationToken" TEXT,
ADD COLUMN     "telegramActivatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramActivationToken_key" ON "User"("telegramActivationToken");
