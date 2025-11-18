/*
  Warnings:

  - Added the required column `ownerId` to the `Room` table without a default value. This is not possible if the table is not empty.

*/
-- Delete existing rooms without owners (they can't be accessed anyway)
DELETE FROM "Room";

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "ownerId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Room_ownerId_idx" ON "Room"("ownerId");
