/**
 * Minimal CI runner: logs in, triggers "run all approved test cases" for a
 * project, downloads the resulting JUnit report, and exits non-zero if
 * anything failed. No CLI-argument-parsing dependency -- there's no existing
 * precedent for one in this repo, and there are only a handful of flags.
 *
 * Usage:
 *   npx tsx src/cli/run-tests.ts --project <id> [--environment <id>]
 *     --base-url http://localhost:4000 --username admin --password ...
 *
 * Every flag also has an env var fallback (CI_PROJECT_ID, CI_ENVIRONMENT_ID,
 * CI_BASE_URL, CI_USERNAME, CI_PASSWORD) so CI secrets never need to appear
 * as plaintext workflow-file arguments.
 *
 * Auth here is session-cookie based, not API-key based (this app has no
 * API-key concept) -- Node's global fetch has no cookie jar, so the
 * `set-cookie` response header is captured manually and replayed as a
 * `Cookie` header on subsequent requests.
 */

import { writeFileSync } from "node:fs";

interface Args {
  projectId: string;
  environmentId?: string;
  baseUrl: string;
  username: string;
  password: string;
}

function parseArgs(): Args | null {
  const flags: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        flags[key] = value;
        i++;
      }
    }
  }

  const projectId = flags.project ?? process.env.CI_PROJECT_ID;
  const baseUrl = flags["base-url"] ?? process.env.CI_BASE_URL ?? "http://localhost:4000";
  const username = flags.username ?? process.env.CI_USERNAME;
  const password = flags.password ?? process.env.CI_PASSWORD;
  const environmentId = flags.environment ?? process.env.CI_ENVIRONMENT_ID;

  if (!projectId || !username || !password) {
    console.error(
      "Usage: run-tests --project <id> [--environment <id>] --base-url <url> --username <user> --password <pass>\n" +
        "(or set CI_PROJECT_ID / CI_ENVIRONMENT_ID / CI_BASE_URL / CI_USERNAME / CI_PASSWORD)",
    );
    return null;
  }

  return { projectId, environmentId, baseUrl, username, password };
}

function extractCookieHeader(res: Response): string {
  const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const raw = typeof getSetCookie === "function" ? getSetCookie.call(res.headers) : [res.headers.get("set-cookie") ?? ""];
  return raw
    .filter(Boolean)
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function main() {
  const args = parseArgs();
  if (!args) {
    process.exitCode = 1;
    return;
  }
  // A batch of many approved test cases can legitimately take a long time --
  // run-all is synchronous from the caller's perspective (the request blocks
  // until every test case in the batch has finished), so this needs a much
  // longer timeout than fetch's default rather than risk a false failure on
  // a large project.
  const LONG_TIMEOUT_MS = 30 * 60 * 1000;

  console.log(`Logging in to ${args.baseUrl} as ${args.username}...`);
  const loginRes = await fetch(`${args.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: args.username, password: args.password }),
  });
  if (!loginRes.ok) {
    console.error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
    process.exitCode = 1;
    return;
  }
  const cookie = extractCookieHeader(loginRes);

  console.log(`Running all approved test cases for project ${args.projectId}...`);
  const runAllRes = await fetch(`${args.baseUrl}/api/projects/${args.projectId}/testcases/run-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(args.environmentId ? { environmentId: args.environmentId } : {}),
    signal: AbortSignal.timeout(LONG_TIMEOUT_MS),
  });
  if (!runAllRes.ok) {
    console.error(`run-all failed: ${runAllRes.status} ${await runAllRes.text()}`);
    process.exitCode = 1;
    return;
  }
  const { batchId, testRunIds } = (await runAllRes.json()) as { batchId: string; testRunIds: string[] };
  console.log(`Batch ${batchId} finished with ${testRunIds.length} run(s). Fetching JUnit report...`);

  const junitRes = await fetch(`${args.baseUrl}/api/testruns/batch/${batchId}/junit`, {
    headers: { Cookie: cookie },
  });
  if (!junitRes.ok) {
    console.error(`Failed to fetch JUnit report: ${junitRes.status} ${await junitRes.text()}`);
    process.exitCode = 1;
    return;
  }
  const junitXml = await junitRes.text();
  writeFileSync("junit-results.xml", junitXml, "utf-8");
  console.log("Wrote junit-results.xml");

  const hasFailure = /<failure|<error/.test(junitXml);
  if (hasFailure) {
    console.error("One or more test cases failed -- see junit-results.xml for details.");
    process.exitCode = 1;
    return;
  }
  console.log("All test cases passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
