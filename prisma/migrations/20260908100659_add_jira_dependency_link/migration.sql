/*
  Warnings:

  - A unique constraint covering the columns `[jiraLinkId]` on the table `Dependency` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Dependency" ADD COLUMN     "jiraLinkId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Dependency_jiraLinkId_key" ON "Dependency"("jiraLinkId");
