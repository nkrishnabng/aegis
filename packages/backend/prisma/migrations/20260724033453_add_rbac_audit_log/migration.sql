-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "projectId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLogEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_projectId_idx" ON "AuditLogEntry"("projectId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_userId_idx" ON "AuditLogEntry"("userId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_action_idx" ON "AuditLogEntry"("action");

-- Backfill: every project/user combination that existed before per-project
-- membership was introduced gets an "owner" ProjectMember row, so nothing
-- already using the app loses access to a project it could previously see
-- (every user could see every project before this migration). Going
-- forward, only a project's creator is auto-added -- everyone else needs an
-- explicit invite via the Members page.
INSERT INTO "ProjectMember" ("id", "projectId", "userId", "role", "createdAt")
SELECT lower(hex(randomblob(16))), p."id", u."id", 'owner', CURRENT_TIMESTAMP
FROM "Project" p
CROSS JOIN "User" u;
