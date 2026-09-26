-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "maxUses" INTEGER,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "useCount" INTEGER NOT NULL DEFAULT 0;
