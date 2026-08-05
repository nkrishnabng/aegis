import fs from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { prisma } from "../db/client";
import { env } from "../env";

function resolvePath(...segments: string[]): string {
  return path.join(env.visualRegressionDir, ...segments);
}

export interface VisualCheckOutcome {
  status: "passed" | "failed";
  note: string;
  diffPercent?: number;
}

/** Compares a step's screenshot against its stored baseline (pixelmatch,
 * pure-JS PNG diffing -- same tool Playwright itself uses internally for
 * `toHaveScreenshot`). No baseline yet -> this screenshot becomes the
 * baseline (passes, matches "first run establishes the contract" behavior
 * elsewhere in this app). A diff beyond `thresholdPercentOverride` (or the
 * global VISUAL_DIFF_THRESHOLD_PERCENT default) fails and creates a pending
 * VisualDiff for human review -- never silently passed, never
 * auto-approved. */
export async function checkVisualMatch(
  testStepId: string,
  testRunResultId: string,
  screenshotPng: Buffer,
  thresholdPercentOverride?: number,
): Promise<VisualCheckOutcome> {
  const baseline = await prisma.visualBaseline.findUnique({ where: { testStepId } });

  if (!baseline) {
    const png = PNG.sync.read(screenshotPng);
    const fileName = `${testStepId}-baseline.png`;
    await fs.mkdir(resolvePath("baselines"), { recursive: true });
    await fs.writeFile(resolvePath("baselines", fileName), screenshotPng);
    await prisma.visualBaseline.create({
      data: {
        testStepId,
        filePath: `baselines/${fileName}`,
        width: png.width,
        height: png.height,
      },
    });
    return { status: "passed", note: "No baseline existed yet -- this screenshot was saved as the new baseline." };
  }

  const baselineBuffer = await fs.readFile(resolvePath(baseline.filePath));
  const baselinePng = PNG.sync.read(baselineBuffer);
  const actualPng = PNG.sync.read(screenshotPng);
  const threshold = thresholdPercentOverride ?? env.visualDiffThresholdPercent;

  if (baselinePng.width !== actualPng.width || baselinePng.height !== actualPng.height) {
    // Can't pixel-diff mismatched dimensions (e.g. viewport changed) --
    // surface as a review-worthy failure rather than silently passing or
    // crashing the run.
    const actualFileName = `${testRunResultId}-actual.png`;
    await fs.mkdir(resolvePath("diffs"), { recursive: true });
    await fs.writeFile(resolvePath("diffs", actualFileName), screenshotPng);
    await prisma.visualDiff.create({
      data: {
        testStepId,
        testRunResultId,
        baselinePath: baseline.filePath,
        actualPath: `diffs/${actualFileName}`,
        diffPath: `diffs/${actualFileName}`, // no pixel diff possible; reuse actual for display
        diffPercent: 100,
        status: "pending",
      },
    });
    return {
      status: "failed",
      note: `Screenshot dimensions (${actualPng.width}x${actualPng.height}) don't match the baseline (${baselinePng.width}x${baselinePng.height}) -- review in Visual Regression.`,
      diffPercent: 100,
    };
  }

  const { width, height } = baselinePng;
  const diffPng = new PNG({ width, height });
  const diffPixelCount = pixelmatch(baselinePng.data, actualPng.data, diffPng.data, width, height, {
    threshold: 0.1,
  });
  const diffPercent = (diffPixelCount / (width * height)) * 100;

  if (diffPercent <= threshold) {
    return {
      status: "passed",
      note: `Visual match (${diffPercent.toFixed(3)}% of pixels differ, within the ${threshold}% threshold).`,
      diffPercent,
    };
  }

  const actualFileName = `${testRunResultId}-actual.png`;
  const diffFileName = `${testRunResultId}-diff.png`;
  await fs.mkdir(resolvePath("diffs"), { recursive: true });
  await fs.writeFile(resolvePath("diffs", actualFileName), screenshotPng);
  await fs.writeFile(resolvePath("diffs", diffFileName), PNG.sync.write(diffPng));
  await prisma.visualDiff.create({
    data: {
      testStepId,
      testRunResultId,
      baselinePath: baseline.filePath,
      actualPath: `diffs/${actualFileName}`,
      diffPath: `diffs/${diffFileName}`,
      diffPercent,
      status: "pending",
    },
  });

  return {
    status: "failed",
    note: `Visual difference detected: ${diffPercent.toFixed(3)}% of pixels differ (threshold ${threshold}%). Review in Visual Regression.`,
    diffPercent,
  };
}
