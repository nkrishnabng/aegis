-- CreateTable
CREATE TABLE "AgentActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "toolName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentActivityEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AgentActivityEvent_projectId_idx" ON "AgentActivityEvent"("projectId");

-- CreateIndex
CREATE INDEX "AgentActivityEvent_turnId_idx" ON "AgentActivityEvent"("turnId");
