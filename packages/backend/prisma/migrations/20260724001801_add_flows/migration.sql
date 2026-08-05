-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Flow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Flow_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FlowVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "steps" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlowVersion_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FlowVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "sourceFlowVersionId" TEXT,
    CONSTRAINT "TestStep_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestStep_sourceFlowVersionId_fkey" FOREIGN KEY ("sourceFlowVersionId") REFERENCES "FlowVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestStep" ("action", "description", "enabled", "id", "locatorCandidates", "order", "selector", "testCaseId", "value") SELECT "action", "description", "enabled", "id", "locatorCandidates", "order", "selector", "testCaseId", "value" FROM "TestStep";
DROP TABLE "TestStep";
ALTER TABLE "new_TestStep" RENAME TO "TestStep";
CREATE INDEX "TestStep_testCaseId_idx" ON "TestStep"("testCaseId");
CREATE INDEX "TestStep_sourceFlowVersionId_idx" ON "TestStep"("sourceFlowVersionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Flow_projectId_idx" ON "Flow"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Flow_projectId_name_key" ON "Flow"("projectId", "name");

-- CreateIndex
CREATE INDEX "FlowVersion_flowId_idx" ON "FlowVersion"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowVersion_flowId_version_key" ON "FlowVersion"("flowId", "version");
