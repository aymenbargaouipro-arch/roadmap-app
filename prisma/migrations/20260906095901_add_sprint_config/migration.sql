-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "sprintDurationWeeks" INTEGER,
ADD COLUMN     "sprintReferenceDate" TIMESTAMP(3),
ADD COLUMN     "sprintReferenceNumber" INTEGER;
