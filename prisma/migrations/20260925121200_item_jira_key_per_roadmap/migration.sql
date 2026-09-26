/*
  Warnings:

  - A unique constraint covering the columns `[roadmapId,jiraIssueKey]` on the table `Item` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Item_jiraIssueKey_key";

-- CreateIndex
CREATE UNIQUE INDEX "Item_roadmapId_jiraIssueKey_key" ON "Item"("roadmapId", "jiraIssueKey");
