import archiver from "archiver";
import type { Response } from "express";
import { prisma } from "../db/client";
import { serializeTestCase } from "../db/serializers";
import { getTestDataSet } from "../db/testDataSetRepo";
import {
  collectDataSecretEnvKeys,
  collectEnvKeys,
  exportTestCaseAsPlaywrightScript,
  fileNameFor,
} from "./exporter";
import { logger } from "../utils/logger";

const PLAYWRIGHT_TEST_VERSION = "^1.48.0";

/** Streams a zip containing every *approved* test case in a project as a
 * standalone, runnable `@playwright/test` project (config + package.json +
 * one spec per test case + a README listing required env vars) -- built for
 * CI use, where the app itself isn't running. Reuses the same per-step
 * compiler (`exportTestCaseAsPlaywrightScript`) as the single-test-case
 * export route, so the two never drift. */
export async function exportProjectAsCiPackage(projectId: string, res: Response): Promise<void> {
  const testCases = await prisma.testCase.findMany({
    where: { projectId, status: "approved" },
    include: {
      steps: true,
      createdBy: true,
      lastModifiedBy: true,
      _count: { select: { changeRequests: { where: { status: "open" } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const records = testCases.map(serializeTestCase);
  const dataSets = await Promise.all(records.map((r) => getTestDataSet(r.id)));

  const envKeys = new Set<string>();
  for (const record of records) {
    for (const key of collectEnvKeys(record)) envKeys.add(key);
  }
  for (const dataSet of dataSets) {
    for (const key of collectDataSecretEnvKeys(dataSet)) envKeys.add(key);
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => {
    logger.error(`ciExporter: archive error: ${err.message}`);
    res.destroy(err);
  });
  archive.pipe(res);

  records.forEach((record, i) => {
    archive.append(exportTestCaseAsPlaywrightScript(record, dataSets[i]), {
      name: `tests/${fileNameFor(record.title)}`,
    });
  });

  archive.append(playwrightConfigSource(), { name: "playwright.config.ts" });
  archive.append(packageJsonSource(), { name: "package.json" });
  archive.append(readmeSource(records.length, [...envKeys].sort()), { name: "README.md" });

  await archive.finalize();
}

function playwrightConfigSource(): string {
  return `import { defineConfig } from '@playwright/test';

// No global \`use.baseURL\` is set here -- each exported step's own \`navigate\`
// action already carries an absolute (or process.env-substituted) URL.
export default defineConfig({
  testDir: './tests',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
  },
});
`;
}

function packageJsonSource(): string {
  return (
    JSON.stringify(
      {
        name: "aegisqa-ci-export",
        private: true,
        scripts: { test: "playwright test" },
        devDependencies: { "@playwright/test": PLAYWRIGHT_TEST_VERSION },
      },
      null,
      2,
    ) + "\n"
  );
}

function readmeSource(testCount: number, envKeys: string[]): string {
  const envSection =
    envKeys.length > 0
      ? `This export references the following environment variables -- set them before running:\n\n` +
        `- from \`{{env.KEY}}\` credential placeholders in the original test steps\n` +
        `- from any secret-flagged columns in a test case's data set (\`DATA_SECRET_<row>_<COLUMN>\`)\n\n` +
        envKeys.map((k) => `- \`${k}\``).join("\n") +
        "\n"
      : "This export does not reference any `{{env.KEY}}` credential placeholders or secret data-set columns.\n";

  return `# AegisQA CI export

${testCount} approved test case(s), exported as a standalone \`@playwright/test\` project.

## Setup

\`\`\`bash
npm install
npx playwright install --with-deps
npm test
\`\`\`

## Environment variables

${envSection}`;
}
