import fs from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import type { VisualDiffRecord } from "@testingmcp/shared";
import { prisma } from "./client";
import { serializeVisualDiff } from "./serializers";
import { env } from "../env";

function resolvePath(...segments: string[]): string {
  return path.join(env.visualRegressionDir, ...segments);
}

export async function listPendingVisualDiffs(projectId: string): Promise<VisualDiffRecord[]> {
  const rows = await prisma.visualDiff.findMany({
    where: { status: "pending", testStep: { testCase: { projectId } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeVisualDiff);
}

/** Promotes the diff's "actual" screenshot to be the step's new baseline --
 * the only way a baseline ever changes. Never automatic; only reachable via
 * an explicit approve click (see routes/visualDiffs.ts). */
export async function approveVisualDiff(id: string): Promise<VisualDiffRecord | null> {
  const diff = await prisma.visualDiff.findUnique({ where: { id } });
  if (!diff) return null;

  const actualBuffer = await fs.readFile(resolvePath(diff.actualPath));
  const png = PNG.sync.read(actualBuffer);
  const baselineFileName = `${diff.testStepId}-baseline.png`;
  await fs.mkdir(resolvePath("baselines"), { recursive: true });
  await fs.writeFile(resolvePath("baselines", baselineFileName), actualBuffer);

  await prisma.visualBaseline.upsert({
    where: { testStepId: diff.testStepId },
    create: {
      testStepId: diff.testStepId,
      filePath: `baselines/${baselineFileName}`,
      width: png.width,
      height: png.height,
    },
    update: {
      filePath: `baselines/${baselineFileName}`,
      width: png.width,
      height: png.height,
    },
  });

  const updated = await prisma.visualDiff.update({
    where: { id },
    data: { status: "approved", resolvedAt: new Date() },
  });
  return serializeVisualDiff(updated);
}

export async function rejectVisualDiff(id: string): Promise<VisualDiffRecord | null> {
  const updated = await prisma.visualDiff
    .update({ where: { id }, data: { status: "rejected", resolvedAt: new Date() } })
    .catch(() => null);
  return updated ? serializeVisualDiff(updated) : null;
}
