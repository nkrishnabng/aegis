import type { DecryptedIntegrationConfig, IssueTrackerAdapter } from "./types";
import { createJiraAdapter } from "./jiraAdapter";
import { createGithubAdapter } from "./githubAdapter";
import { createAzureDevOpsAdapter } from "./azureDevOpsAdapter";
import { createMockAdapter } from "./mockAdapter";

/** Selects the adapter for a decrypted integration config. All three
 * declared types (jira, githubIssues, azureDevOps) now have real
 * implementations, built against each API's documented contract the same
 * way jiraAdapter.ts was -- see README's "Known limitations" for which of
 * these have been live-verified against a real account vs. built to spec
 * only. `createMockAdapter` stays as the fallback for any future
 * `IntegrationType` added before its real adapter lands, so the interface
 * stays provably extensible without ever silently pretending a push
 * succeeded. */
export function getAdapter(config: DecryptedIntegrationConfig): IssueTrackerAdapter {
  switch (config.type) {
    case "jira":
      return createJiraAdapter({
        baseUrl: config.baseUrl,
        email: config.email,
        apiToken: config.apiToken,
        projectKey: config.projectKey,
      });
    case "githubIssues":
      return createGithubAdapter({
        baseUrl: config.baseUrl,
        apiToken: config.apiToken,
        projectKey: config.projectKey,
      });
    case "azureDevOps":
      return createAzureDevOpsAdapter({
        baseUrl: config.baseUrl,
        apiToken: config.apiToken,
        projectKey: config.projectKey,
      });
    default:
      return createMockAdapter(config.type);
  }
}
