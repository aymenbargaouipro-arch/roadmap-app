/*
  Warnings:

  - You are about to drop the column `jiraOrphanedAt` on the `Item` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Item" DROP COLUMN "jiraOrphanedAt",
ADD COLUMN     "jiraHiddenAt" TIMESTAMP(3);
