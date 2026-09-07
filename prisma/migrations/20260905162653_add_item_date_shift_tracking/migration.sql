-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "plannedEndDate" TIMESTAMP(3),
ADD COLUMN     "plannedStartDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ItemDateShift" (
    "id" TEXT NOT NULL,
    "previousPlannedStart" TIMESTAMP(3) NOT NULL,
    "previousPlannedEnd" TIMESTAMP(3) NOT NULL,
    "newPlannedStart" TIMESTAMP(3) NOT NULL,
    "newPlannedEnd" TIMESTAMP(3) NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "ItemDateShift_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ItemDateShift" ADD CONSTRAINT "ItemDateShift_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
