/*
  Warnings:

  - Added the required column `userId` to the `ChatMessage` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Backfill: historical messages predate per-user chat privacy, so we don't
-- actually know who typed each one. Attach them to the project's earliest
-- owner (falling back to any member, then to the system's earliest user)
-- rather than losing them or leaving them orphaned -- same "don't lose
-- access to something that existed before this feature" reasoning as the
-- RBAC ProjectMember backfill. Every message created from here on always
-- carries its real author's userId.
INSERT INTO "new_ChatMessage" ("id", "projectId", "userId", "role", "content", "createdAt")
SELECT
  cm."id",
  cm."projectId",
  COALESCE(
    (SELECT pm."userId" FROM "ProjectMember" pm
     WHERE pm."projectId" = cm."projectId"
     ORDER BY CASE pm."role" WHEN 'owner' THEN 0 ELSE 1 END, pm."createdAt" ASC
     LIMIT 1),
    (SELECT u."id" FROM "User" u ORDER BY u."createdAt" ASC LIMIT 1)
  ),
  cm."role",
  cm."content",
  cm."createdAt"
FROM "ChatMessage" cm;
DROP TABLE "ChatMessage";
ALTER TABLE "new_ChatMessage" RENAME TO "ChatMessage";
CREATE INDEX "ChatMessage_projectId_userId_idx" ON "ChatMessage"("projectId", "userId");
CREATE TABLE "new_TestCase" (
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
    "module" TEXT,
    "sourcePrompt" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "lastModifiedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestCase_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "TargetUrl" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCase_lastModifiedById_fkey" FOREIGN KEY ("lastModifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestCase" ("createdAt", "createdById", "expectedResult", "id", "module", "objective", "preconditions", "priority", "projectId", "status", "testData", "title", "type", "updatedAt", "urlId") SELECT "createdAt", "createdById", "expectedResult", "id", "module", "objective", "preconditions", "priority", "projectId", "status", "testData", "title", "type", "updatedAt", "urlId" FROM "TestCase";
DROP TABLE "TestCase";
ALTER TABLE "new_TestCase" RENAME TO "TestCase";
CREATE INDEX "TestCase_projectId_idx" ON "TestCase"("projectId");
CREATE INDEX "TestCase_urlId_idx" ON "TestCase"("urlId");
CREATE INDEX "TestCase_createdById_idx" ON "TestCase"("createdById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
