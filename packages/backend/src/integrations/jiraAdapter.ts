import type { CreatedIssue, IssueInput, IssueTrackerAdapter } from "./types";

/** Jira Cloud's v3 issue API requires the `description` field in Atlassian
 * Document Format, not a plain string. This builds the minimal valid ADF for
 * plain text: one `paragraph` node per blank-line-separated block, no rich
 * formatting -- sufficient for an auto-generated failure report. */
function toAdf(text: string) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim().length > 0);
  return {
    type: "doc",
    version: 1,
    content: blocks.map((block) => ({
      type: "paragraph",
      content: [{ type: "text", text: block }],
    })),
  };
}

interface JiraErrorBody {
  errorMessages?: string[];
  errors?: Record<string, string>;
}

/** Real Jira Cloud adapter -- REST API v3, Basic auth via email + API token
 * (https://id.atlassian.com/manage-profile/security/api-tokens), against a
 * `*.atlassian.net` base URL. Jira Server/Data Center uses a different auth
 * shape (Bearer PAT, v2 API) and isn't supported by this adapter. */
export function createJiraAdapter(config: {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}): IssueTrackerAdapter {
  const authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;
  const baseUrl = config.baseUrl.replace(/\/+$/, "");

  return {
    async createIssue(input: IssueInput): Promise<CreatedIssue> {
      const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          fields: {
            project: { key: config.projectKey },
            summary: input.title,
            issuetype: { name: "Bug" },
            description: toAdf(input.description),
          },
        }),
      });

      if (!res.ok) {
        let detail = await res.text();
        try {
          const parsed = JSON.parse(detail) as JiraErrorBody;
          const messages = [
            ...(parsed.errorMessages ?? []),
            ...Object.entries(parsed.errors ?? {}).map(([field, msg]) => `${field}: ${msg}`),
          ];
          if (messages.length > 0) detail = messages.join("; ");
        } catch {
          // detail stays as the raw response text
        }
        throw new Error(`Jira API error (${res.status}): ${detail}`);
      }

      const body = (await res.json()) as { id: string; key: string; self: string };
      // `self` is the API resource URL, not the human-browsable issue page.
      return { key: body.key, url: `${baseUrl}/browse/${body.key}` };
    },
  };
}
