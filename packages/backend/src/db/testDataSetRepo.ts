import type { TestDataSetInput, TestDataSetRecord } from "@testingmcp/shared";
import type { TestDataSet } from "@prisma/client";
import { prisma } from "./client";

export function serializeTestDataSet(row: TestDataSet): TestDataSetRecord {
  return {
    id: row.id,
    testCaseId: row.testCaseId,
    columns: JSON.parse(row.columns) as string[],
    secretColumns: JSON.parse(row.secretColumns) as string[],
    rows: JSON.parse(row.rows) as Record<string, string>[],
    source: row.source as TestDataSetRecord["source"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getTestDataSet(testCaseId: string): Promise<TestDataSetRecord | null> {
  const row = await prisma.testDataSet.findUnique({ where: { testCaseId } });
  return row ? serializeTestDataSet(row) : null;
}

/** Replaces the test case's dataset wholesale (no versioning -- see the
 * schema comment on TestDataSet). `secretColumns` is filtered down to only
 * names that actually appear in `columns`, so a stale secret flag can't
 * survive a re-upload that dropped that column. */
export async function upsertTestDataSet(
  testCaseId: string,
  input: TestDataSetInput,
): Promise<TestDataSetRecord> {
  const columnSet = new Set(input.columns);
  const secretColumns = input.secretColumns.filter((c) => columnSet.has(c));
  const data = {
    columns: JSON.stringify(input.columns),
    secretColumns: JSON.stringify(secretColumns),
    rows: JSON.stringify(input.rows),
    source: input.source,
  };
  const row = await prisma.testDataSet.upsert({
    where: { testCaseId },
    create: { testCaseId, ...data },
    update: data,
  });
  return serializeTestDataSet(row);
}

export async function deleteTestDataSet(testCaseId: string): Promise<void> {
  await prisma.testDataSet.deleteMany({ where: { testCaseId } });
}

/** Updates which columns are flagged secret on an already-uploaded data set,
 * without re-parsing/replacing its rows -- lets the UI toggle a column's
 * secret flag without needing the original raw CSV/JSON text on hand. */
export async function updateSecretColumns(
  testCaseId: string,
  secretColumns: string[],
): Promise<TestDataSetRecord | null> {
  const existing = await prisma.testDataSet.findUnique({ where: { testCaseId } });
  if (!existing) return null;
  const columnSet = new Set(JSON.parse(existing.columns) as string[]);
  const filtered = secretColumns.filter((c) => columnSet.has(c));
  const row = await prisma.testDataSet.update({
    where: { testCaseId },
    data: { secretColumns: JSON.stringify(filtered) },
  });
  return serializeTestDataSet(row);
}
