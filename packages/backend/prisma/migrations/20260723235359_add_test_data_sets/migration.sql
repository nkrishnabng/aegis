-- AlterTable
ALTER TABLE "TestRun" ADD COLUMN "dataRowIndex" INTEGER;

-- CreateTable
CREATE TABLE "TestDataSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "columns" TEXT NOT NULL,
    "secretColumns" TEXT NOT NULL,
    "rows" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestDataSet_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TestDataSet_testCaseId_key" ON "TestDataSet"("testCaseId");
