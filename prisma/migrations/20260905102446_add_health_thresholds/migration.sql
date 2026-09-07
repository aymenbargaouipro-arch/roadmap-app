-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "healthActiveDependencyTriggersRed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "healthBlockedItemTriggersRed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "healthHighRiskTriggersRed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "healthLateCountOrangeThreshold" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "healthLateRatioRedThreshold" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "healthMediumRiskTriggersOrange" BOOLEAN NOT NULL DEFAULT true;
