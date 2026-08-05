import type { IntegrationType } from "@testingmcp/shared";

export interface IssueInput {
  title: string;
  description: string;
}

export interface CreatedIssue {
  key: string;
  url: string;
}

/** Generic issue-tracker contract. `createJiraAdapter` is the only real
 * implementation today; every other `IntegrationType` resolves to
 * `mockAdapter`, which proves this interface is extensible without
 * pretending to be a real integration -- see adapterFactory.ts. */
export interface IssueTrackerAdapter {
  createIssue(input: IssueInput): Promise<CreatedIssue>;
}

export interface DecryptedIntegrationConfig {
  type: IntegrationType;
  baseUrl: string;
  email: string;
  projectKey: string;
  apiToken: string;
}
