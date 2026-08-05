-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testCaseId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "ChangeRequest_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestCase_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "TargetUrl" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestCase" ("createdAt", "expectedResult", "id", "objective", "preconditions", "priority", "projectId", "status", "testData", "title", "type", "updatedAt", "urlId") SELECT "createdAt", "expectedResult", "id", "objective", "preconditions", "priority", "projectId", "status", "testData", "title", "type", "updatedAt", "urlId" FROM "TestCase";
DROP TABLE "TestCase";
ALTER TABLE "new_TestCase" RENAME TO "TestCase";
CREATE INDEX "TestCase_projectId_idx" ON "TestCase"("projectId");
CREATE INDEX "TestCase_urlId_idx" ON "TestCase"("urlId");
CREATE INDEX "TestCase_createdById_idx" ON "TestCase"("createdById");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "id", "passwordHash", "username") SELECT "createdAt", "id", "passwordHash", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ChangeRequest_testCaseId_idx" ON "ChangeRequest"("testCaseId");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");
