-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "apiTokenEncrypted" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Integration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JiraPush" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testRunId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "jiraIssueKey" TEXT,
    "jiraIssueUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pushedAt" DATETIME,
    CONSTRAINT "JiraPush_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Integration_projectId_idx" ON "Integration"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_projectId_type_key" ON "Integration"("projectId", "type");

-- CreateIndex
CREATE INDEX "JiraPush_testRunId_idx" ON "JiraPush"("testRunId");

-- CreateIndex
CREATE INDEX "JiraPush_status_idx" ON "JiraPush"("status");
