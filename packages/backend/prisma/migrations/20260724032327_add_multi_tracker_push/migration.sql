-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JiraPush" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testRunId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'jira',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "jiraIssueKey" TEXT,
    "jiraIssueUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pushedAt" DATETIME,
    CONSTRAINT "JiraPush_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_JiraPush" ("createdAt", "errorMessage", "id", "jiraIssueKey", "jiraIssueUrl", "pushedAt", "status", "testRunId") SELECT "createdAt", "errorMessage", "id", "jiraIssueKey", "jiraIssueUrl", "pushedAt", "status", "testRunId" FROM "JiraPush";
DROP TABLE "JiraPush";
ALTER TABLE "new_JiraPush" RENAME TO "JiraPush";
CREATE INDEX "JiraPush_testRunId_idx" ON "JiraPush"("testRunId");
CREATE INDEX "JiraPush_status_idx" ON "JiraPush"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
