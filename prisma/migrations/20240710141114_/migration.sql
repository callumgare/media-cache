/*
  Warnings:

  - A unique constraint covering the columns `[finderSourceId,finderMediaId,type]` on the table `File` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "File_finderSourceId_finderMediaId_type_key" ON "File"("finderSourceId", "finderMediaId", "type");
