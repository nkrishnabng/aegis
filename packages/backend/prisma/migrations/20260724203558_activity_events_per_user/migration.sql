/*
  Warnings:

  - Added the required column `userId` to the `AgentActivityEvent` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "toolName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentActivityEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Backfill: same reasoning as ChatMessage's userId backfill -- these rows
-- predate per-user activity isolation, so attach them to the project's
-- earliest owner rather than losing them.
INSERT INTO "new_AgentActivityEvent" ("id", "projectId", "userId", "turnId", "stage", "label", "detail", "toolName", "createdAt")
SELECT
  ae."id",
  ae."projectId",
  COALESCE(
    (SELECT pm."userId" FROM "ProjectMember" pm
     WHERE pm."projectId" = ae."projectId"
     ORDER BY CASE pm."role" WHEN 'owner' THEN 0 ELSE 1 END, pm."createdAt" ASC
     LIMIT 1),
    (SELECT u."id" FROM "User" u ORDER BY u."createdAt" ASC LIMIT 1)
  ),
  ae."turnId",
  ae."stage",
  ae."label",
  ae."detail",
  ae."toolName",
  ae."createdAt"
FROM "AgentActivityEvent" ae;
DROP TABLE "AgentActivityEvent";
ALTER TABLE "new_AgentActivityEvent" RENAME TO "AgentActivityEvent";
CREATE INDEX "AgentActivityEvent_projectId_userId_idx" ON "AgentActivityEvent"("projectId", "userId");
CREATE INDEX "AgentActivityEvent_turnId_idx" ON "AgentActivityEvent"("turnId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
