-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TargetUrl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "lastInspectedAt" DATETIME,
    CONSTRAINT "TargetUrl_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "urlId" TEXT,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "preconditions" TEXT NOT NULL,
    "testData" TEXT NOT NULL,
    "expectedResult" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestCase_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "TargetUrl" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "selector" TEXT,
    "value" TEXT,
    "description" TEXT NOT NULL,
    CONSTRAINT "TestStep_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL DEFAULT 'user',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "TestRun_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestRunResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testRunId" TEXT NOT NULL,
    "testStepId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "actualResult" TEXT,
    "errorMessage" TEXT,
    "suggestedFix" TEXT,
    "recovered" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TestRunResult_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestRunResult_testStepId_fkey" FOREIGN KEY ("testStepId") REFERENCES "TestStep" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Screenshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testRunResultId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "takenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Screenshot_testRunResultId_fkey" FOREIGN KEY ("testRunResultId") REFERENCES "TestRunResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExecutionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testRunId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutionLog_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TargetUrl_projectId_idx" ON "TargetUrl"("projectId");

-- CreateIndex
CREATE INDEX "ChatMessage_projectId_idx" ON "ChatMessage"("projectId");

-- CreateIndex
CREATE INDEX "TestCase_projectId_idx" ON "TestCase"("projectId");

-- CreateIndex
CREATE INDEX "TestCase_urlId_idx" ON "TestCase"("urlId");

-- CreateIndex
CREATE INDEX "TestStep_testCaseId_idx" ON "TestStep"("testCaseId");

-- CreateIndex
CREATE INDEX "TestRun_testCaseId_idx" ON "TestRun"("testCaseId");

-- CreateIndex
CREATE INDEX "TestRunResult_testRunId_idx" ON "TestRunResult"("testRunId");

-- CreateIndex
CREATE INDEX "TestRunResult_testStepId_idx" ON "TestRunResult"("testStepId");

-- CreateIndex
CREATE INDEX "Screenshot_testRunResultId_idx" ON "Screenshot"("testRunResultId");

-- CreateIndex
CREATE INDEX "ExecutionLog_testRunId_idx" ON "ExecutionLog"("testRunId");
