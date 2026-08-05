-- AlterTable
ALTER TABLE "TestRunResult" ADD COLUMN "pageUrl" TEXT;
ALTER TABLE "TestRunResult" ADD COLUMN "storageStateJson" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TestRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "environmentId" TEXT,
    "status" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL DEFAULT 'user',
    "batchId" TEXT,
    "tracePath" TEXT,
    "videoPath" TEXT,
    "continuedFromChat" BOOLEAN NOT NULL DEFAULT false,
    "resumedFromRunId" TEXT,
    "resumedFromStepOrder" INTEGER,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "TestRun_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestRun" ("batchId", "environmentId", "finishedAt", "id", "startedAt", "status", "testCaseId", "triggeredBy") SELECT "batchId", "environmentId", "finishedAt", "id", "startedAt", "status", "testCaseId", "triggeredBy" FROM "TestRun";
DROP TABLE "TestRun";
ALTER TABLE "new_TestRun" RENAME TO "TestRun";
CREATE INDEX "TestRun_testCaseId_idx" ON "TestRun"("testCaseId");
CREATE INDEX "TestRun_environmentId_idx" ON "TestRun"("environmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
