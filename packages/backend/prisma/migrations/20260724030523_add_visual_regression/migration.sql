-- AlterTable
ALTER TABLE "TestRunResult" ADD COLUMN "action" TEXT;

-- CreateTable
CREATE TABLE "VisualBaseline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testStepId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VisualBaseline_testStepId_fkey" FOREIGN KEY ("testStepId") REFERENCES "TestStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VisualDiff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testStepId" TEXT NOT NULL,
    "testRunResultId" TEXT NOT NULL,
    "baselinePath" TEXT NOT NULL,
    "actualPath" TEXT NOT NULL,
    "diffPath" TEXT NOT NULL,
    "diffPercent" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "VisualDiff_testStepId_fkey" FOREIGN KEY ("testStepId") REFERENCES "TestStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VisualDiff_testRunResultId_fkey" FOREIGN KEY ("testRunResultId") REFERENCES "TestRunResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VisualBaseline_testStepId_key" ON "VisualBaseline"("testStepId");

-- CreateIndex
CREATE INDEX "VisualBaseline_testStepId_idx" ON "VisualBaseline"("testStepId");

-- CreateIndex
CREATE INDEX "VisualDiff_testStepId_idx" ON "VisualDiff"("testStepId");

-- CreateIndex
CREATE INDEX "VisualDiff_status_idx" ON "VisualDiff"("status");
