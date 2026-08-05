import type { IntegrationType } from "@testingmcp/shared";
import type { CreatedIssue, IssueInput, IssueTrackerAdapter } from "./types";
import { logger } from "../utils/logger";

let mockCounter = 0;

/** Stand-in for tracker types that don't have a real adapter yet
 * (githubIssues, azureDevOps). Proves `IssueTrackerAdapter` is genuinely
 * extensible beyond Jira without pretending to be a working integration --
 * the key/url are unmistakably fake and every call is logged as a mock, so
 * this can never be confused with a real push (see the Jira integration
 * plan's "no silent fake success" invariant). */
export function createMockAdapter(type: IntegrationType): IssueTrackerAdapter {
  return {
    async createIssue(input: IssueInput): Promise<CreatedIssue> {
      mockCounter += 1;
      const key = `MOCK-${mockCounter}`;
      logger.warn(
        `integrations: "${type}" has no real adapter yet -- returning a mock issue (${key}) instead of calling a real API. Title: "${input.title}"`,
      );
      return { key, url: `about:blank#mock-${type}-issue-${mockCounter}` };
    },
  };
}
