import type { CreatedIssue, IssueInput, IssueTrackerAdapter } from "./types";

interface AzureErrorBody {
  message?: string;
}

/** Escapes a JSON Patch string value's use inside our own hand-built patch
 * document -- JSON.stringify already handles this per-field, so this exists
 * only to turn newlines into `<br>` since the work item Description field
 * renders as HTML and a bare "\n" is otherwise invisible. */
function toHtmlDescription(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/\n/g, "<br>");
}

/** Real Azure DevOps adapter -- Work Item Tracking REST API
 * (`POST {organizationUrl}/{project}/_apis/wit/workitems/$Bug?api-version=7.1`),
 * Basic auth with an empty username and a Personal Access Token as the
 * password (the documented PAT auth scheme for Azure DevOps REST calls).
 * `baseUrl` is the organization URL, e.g. `https://dev.azure.com/myorg`;
 * `projectKey` is the Azure DevOps project name (not a repo). */
export function createAzureDevOpsAdapter(config: {
  baseUrl: string;
  apiToken: string;
  projectKey: string;
}): IssueTrackerAdapter {
  const organizationUrl = config.baseUrl.replace(/\/+$/, "");
  const authHeader = `Basic ${Buffer.from(`:${config.apiToken}`).toString("base64")}`;

  return {
    async createIssue(input: IssueInput): Promise<CreatedIssue> {
      const url = `${organizationUrl}/${encodeURIComponent(config.projectKey)}/_apis/wit/workitems/$Bug?api-version=7.1`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json-patch+json",
        },
        body: JSON.stringify([
          { op: "add", path: "/fields/System.Title", value: input.title },
          { op: "add", path: "/fields/System.Description", value: toHtmlDescription(input.description) },
        ]),
      });

      if (!res.ok) {
        let detail = await res.text();
        try {
          const parsed = JSON.parse(detail) as AzureErrorBody;
          if (parsed.message) detail = parsed.message;
        } catch {
          // detail stays as the raw response text
        }
        throw new Error(`Azure DevOps API error (${res.status}): ${detail}`);
      }

      const body = (await res.json()) as { id: number };
      // The API response's own `url` is the REST resource, not the browsable
      // work item page -- build that explicitly.
      return {
        key: `#${body.id}`,
        url: `${organizationUrl}/${encodeURIComponent(config.projectKey)}/_workitems/edit/${body.id}`,
      };
    },
  };
}
