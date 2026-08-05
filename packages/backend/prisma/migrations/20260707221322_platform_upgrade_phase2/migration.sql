-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "browser" TEXT NOT NULL DEFAULT 'chromium',
    "headless" BOOLEAN NOT NULL DEFAULT true,
    "viewportWidth" INTEGER NOT NULL DEFAULT 1280,
    "viewportHeight" INTEGER NOT NULL DEFAULT 720,
    "credentialsEncrypted" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HealingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testStepId" TEXT NOT NULL,
    "testRunResultId" TEXT NOT NULL,
    "oldSelector" TEXT NOT NULL,
    "newSelector" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "screenshotId" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealingEvent_testStepId_fkey" FOREIGN KEY ("testStepId") REFERENCES "TestStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HealingEvent_testRunResultId_fkey" FOREIGN KEY ("testRunResultId") REFERENCES "TestRunResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExecutionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testRunId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'execution',
    "message" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutionLog_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ExecutionLog" ("id", "level", "message", "testRunId", "timestamp") SELECT "id", "level", "message", "testRunId", "timestamp" FROM "ExecutionLog";
DROP TABLE "ExecutionLog";
ALTER TABLE "new_ExecutionLog" RENAME TO "ExecutionLog";
CREATE INDEX "ExecutionLog_testRunId_idx" ON "ExecutionLog"("testRunId");
CREATE TABLE "new_TestRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "environmentId" TEXT,
    "status" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL DEFAULT 'user',
    "batchId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "TestRun_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestRun" ("finishedAt", "id", "startedAt", "status", "testCaseId", "triggeredBy") SELECT "finishedAt", "id", "startedAt", "status", "testCaseId", "triggeredBy" FROM "TestRun";
DROP TABLE "TestRun";
ALTER TABLE "new_TestRun" RENAME TO "TestRun";
CREATE INDEX "TestRun_testCaseId_idx" ON "TestRun"("testCaseId");
CREATE INDEX "TestRun_environmentId_idx" ON "TestRun"("environmentId");
CREATE TABLE "new_TestStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "selector" TEXT,
    "locatorCandidates" TEXT,
    "value" TEXT,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TestStep_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TestStep" ("action", "description", "id", "order", "selector", "testCaseId", "value") SELECT "action", "description", "id", "order", "selector", "testCaseId", "value" FROM "TestStep";
DROP TABLE "TestStep";
ALTER TABLE "new_TestStep" RENAME TO "TestStep";
CREATE INDEX "TestStep_testCaseId_idx" ON "TestStep"("testCaseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Environment_projectId_idx" ON "Environment"("projectId");

-- CreateIndex
CREATE INDEX "HealingEvent_testStepId_idx" ON "HealingEvent"("testStepId");

-- CreateIndex
CREATE INDEX "HealingEvent_testRunResultId_idx" ON "HealingEvent"("testRunResultId");
