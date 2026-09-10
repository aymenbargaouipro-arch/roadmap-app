/*
  Warnings:

  - A unique constraint covering the columns `[jiraIssueKey]` on the table `Item` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "jiraIssueKey" TEXT;

-- AlterTable
ALTER TABLE "Roadmap" ADD COLUMN     "jiraEndDateFieldId" TEXT,
ADD COLUMN     "jiraLastSyncAt" TIMESTAMP(3),
ADD COLUMN     "jiraProjectKey" TEXT,
ADD COLUMN     "jiraStartDateFieldId" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "jiraApiTokenEncrypted" TEXT,
ADD COLUMN     "jiraConnectedAt" TIMESTAMP(3),
ADD COLUMN     "jiraEmail" TEXT,
ADD COLUMN     "jiraSiteUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Item_jiraIssueKey_key" ON "Item"("jiraIssueKey");
