import type { CreatedIssue, IssueInput, IssueTrackerAdapter } from "./types";

interface GithubErrorBody {
  message?: string;
  errors?: { field?: string; code?: string; message?: string }[];
}

/** Real GitHub Issues adapter -- REST API (`POST /repos/{owner}/{repo}/issues`),
 * Bearer auth via a personal access token (classic PAT needs the `repo`
 * scope; a fine-grained PAT needs "Issues: write" on the target repo).
 * `baseUrl` defaults to `https://api.github.com`; override it for GitHub
 * Enterprise Server (e.g. `https://github.mycompany.com/api/v3`).
 * `projectKey` is `owner/repo`. */
export function createGithubAdapter(config: {
  baseUrl: string;
  apiToken: string;
  projectKey: string;
}): IssueTrackerAdapter {
  const baseUrl = (config.baseUrl || "https://api.github.com").replace(/\/+$/, "");
  const [owner, repo] = config.projectKey.split("/").map((s) => s.trim());

  return {
    async createIssue(input: IssueInput): Promise<CreatedIssue> {
      if (!owner || !repo) {
        throw new Error(`GitHub project key must be "owner/repo", got: "${config.projectKey}"`);
      }

      const res = await fetch(`${baseUrl}/repos/${owner}/${repo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ title: input.title, body: input.description }),
      });

      if (!res.ok) {
        let detail = await res.text();
        try {
          const parsed = JSON.parse(detail) as GithubErrorBody;
          const messages = [
            ...(parsed.message ? [parsed.message] : []),
            ...(parsed.errors ?? []).map((e) => e.message ?? `${e.field}: ${e.code}`),
          ];
          if (messages.length > 0) detail = messages.join("; ");
        } catch {
          // detail stays as the raw response text
        }
        throw new Error(`GitHub API error (${res.status}): ${detail}`);
      }

      const body = (await res.json()) as { number: number; html_url: string };
      return { key: `#${body.number}`, url: body.html_url };
    },
  };
}
