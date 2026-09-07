-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('FD', 'DD', 'FF', 'DF');

-- CreateEnum
CREATE TYPE "DependencyTargetKind" AS ENUM ('ITEM', 'TEAM', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "DependencyStatus" AS ENUM ('PENDING', 'RESOLVED');

-- DropForeignKey
ALTER TABLE "Dependency" DROP CONSTRAINT "Dependency_blockedItemId_fkey";

-- DropForeignKey
ALTER TABLE "Dependency" DROP CONSTRAINT "Dependency_blockingItemId_fkey";

-- DropIndex
DROP INDEX "Dependency_blockingItemId_blockedItemId_key";

-- AlterTable
ALTER TABLE "Dependency" ADD COLUMN     "externalSystemName" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "status" "DependencyStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "targetKind" "DependencyTargetKind" NOT NULL DEFAULT 'ITEM',
ADD COLUMN     "targetRoadmapId" TEXT,
ADD COLUMN     "type" "DependencyType" NOT NULL DEFAULT 'FD',
ALTER COLUMN "blockingItemId" DROP NOT NULL,
ALTER COLUMN "blockedItemId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_blockingItemId_fkey" FOREIGN KEY ("blockingItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_blockedItemId_fkey" FOREIGN KEY ("blockedItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_targetRoadmapId_fkey" FOREIGN KEY ("targetRoadmapId") REFERENCES "Roadmap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
