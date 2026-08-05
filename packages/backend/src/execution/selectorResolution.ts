import type { ElementSelector } from "@testingmcp/shared";
import { mcpManager } from "../mcp/mcpManager";
import { mcpResultToText } from "../mcp/toolConversion";
import { recoverSelectorRef } from "../agent/agentService";
import { logger } from "../utils/logger";

export interface ResolvedElement {
  ref: string;
  recovered: boolean;
  matchedSelector?: ElementSelector;
  confidence?: "high" | "low";
  note?: string;
  snapshotText: string;
}

// Playwright MCP's browser_snapshot renders the accessibility tree as lines
// roughly like `- button "Log in" [ref=e12]`, but a focused/checked/disabled
// element gets an extra bracketed state annotation *before* the ref, e.g.
// `- textbox "Username" [active] [ref=e12]`. The (?:\[(?!ref=)[^\]]*\]\s*)*
// group skips over any number of such non-ref annotations so the ref is
// still found regardless of where it falls among them. We parse defensively:
// if the exact format differs further, this simply finds nothing and we fall
// back to asking Claude to read the raw snapshot text directly (see below),
// so correctness never depends on this regex being exactly right.
const SNAPSHOT_LINE =
  /-\s*([a-zA-Z][\w-]*)\s*(?:"([^"]*)")?\s*(?:\[(?!ref=)[^\]]*\]\s*)*\[ref=([^\]\s]+)\]/g;

interface SnapshotEntry {
  role: string;
  name?: string;
  ref: string;
}

function parseSnapshot(text: string): SnapshotEntry[] {
  const entries: SnapshotEntry[] = [];
  for (const match of text.matchAll(SNAPSHOT_LINE)) {
    entries.push({ role: match[1], name: match[2], ref: match[3] });
  }
  return entries;
}

/** Resilient-selector priority for the accessibility-tree-based match: role,
 * label, placeholder, text, alt text, test id -- all of these resolve to a
 * role+accessible-name pair in the snapshot, so one matcher covers them all. */
function findDirectMatch(
  entries: SnapshotEntry[],
  selector: ElementSelector,
): SnapshotEntry | undefined {
  const targetRole = selector.role?.toLowerCase();
  const targetName = (
    selector.name ??
    selector.label ??
    selector.placeholder ??
    selector.altText ??
    selector.testId
  )?.toLowerCase();

  if (targetRole) {
    const exact = entries.find(
      (e) =>
        e.role.toLowerCase() === targetRole &&
        targetName &&
        e.name?.toLowerCase() === targetName,
    );
    if (exact) return exact;

    const partial = entries.find(
      (e) =>
        e.role.toLowerCase() === targetRole &&
        targetName &&
        e.name?.toLowerCase().includes(targetName),
    );
    if (partial) return partial;
  }

  if (targetName) {
    const byName = entries.find((e) => e.name?.toLowerCase() === targetName);
    if (byName) return byName;
  }

  return undefined;
}

/** `css`/`xpath` selectors never appear in the accessibility tree, so they're
 * verified directly against the live DOM via `browser_evaluate`, then passed
 * through as a raw `target` string -- Playwright MCP's tool schema documents
 * `target` as accepting "a unique element selector" in addition to a
 * snapshot ref, and Playwright's own selector-engine syntax accepts an
 * `xpath=` prefix for XPath expressions. */
async function tryRawSelector(
  sessionKey: string,
  selector: ElementSelector,
): Promise<string | null> {
  if (selector.strategy === "css" && selector.css) {
    const exists = await checkExists(sessionKey, selector.css, false);
    return exists ? selector.css : null;
  }
  if (selector.strategy === "xpath" && selector.xpath) {
    const exists = await checkExists(sessionKey, selector.xpath, true);
    return exists ? `xpath=${selector.xpath}` : null;
  }
  return null;
}

async function checkExists(sessionKey: string, expr: string, isXpath: boolean): Promise<boolean> {
  try {
    const fn = isXpath
      ? `() => !!document.evaluate(${JSON.stringify(expr)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`
      : `() => !!document.querySelector(${JSON.stringify(expr)})`;
    const result = await mcpManager.callTool(sessionKey, "browser_evaluate", { function: fn });
    if (result.isError) return false;
    return mcpResultToText(result).toLowerCase().includes("true");
  } catch {
    return false;
  }
}

/**
 * Takes a fresh accessibility snapshot and resolves a stored, resilient
 * selector descriptor against it, in resilient-locator priority order:
 * primary selector -> stored alternate candidates -> stable CSS/XPath ->
 * LLM-assisted recovery as a last resort (only reached when the page has
 * genuinely changed, so a normal unchanged page never pays that latency).
 */
export async function resolveElement(
  sessionKey: string,
  selector: ElementSelector,
  projectId: string,
  locatorCandidates?: ElementSelector[] | null,
): Promise<ResolvedElement> {
  const snapshotResult = await mcpManager.callTool(sessionKey, "browser_snapshot", {});
  const snapshotText = mcpResultToText(snapshotResult);
  if (snapshotResult.isError) {
    throw new Error(snapshotText || "browser_snapshot reported an error.");
  }

  const entries = parseSnapshot(snapshotText);

  // 1. Primary selector.
  const direct = findDirectMatch(entries, selector);
  if (direct) {
    return { ref: direct.ref, recovered: false, snapshotText };
  }
  const rawPrimary = await tryRawSelector(sessionKey, selector);
  if (rawPrimary) {
    return { ref: rawPrimary, recovered: false, snapshotText };
  }

  // 2. Stored alternate candidates (previously-approved healed locators).
  for (const candidate of locatorCandidates ?? []) {
    const candidateMatch = findDirectMatch(entries, candidate);
    if (candidateMatch) {
      return {
        ref: candidateMatch.ref,
        recovered: true,
        matchedSelector: candidate,
        confidence: "high",
        note: "Matched a previously-approved alternate locator.",
        snapshotText,
      };
    }
    const rawCandidate = await tryRawSelector(sessionKey, candidate);
    if (rawCandidate) {
      return {
        ref: rawCandidate,
        recovered: true,
        matchedSelector: candidate,
        confidence: "high",
        note: "Matched a previously-approved alternate locator.",
        snapshotText,
      };
    }
  }

  // 3. LLM-assisted recovery -- last resort.
  logger.warn(
    `executor: no direct match for "${selector.description}", asking the agent to recover it`,
  );
  const recovery = await recoverSelectorRef({
    projectId,
    descriptor: { role: selector.role, name: selector.name, description: selector.description },
    pageSnapshot: snapshotText,
  });

  if (!recovery.ref) {
    throw new Error(
      `Could not locate element "${selector.description}" on the page (${recovery.note})`,
    );
  }

  const matchedSelector: ElementSelector | undefined = recovery.matchedRole
    ? {
        strategy: "role",
        role: recovery.matchedRole,
        name: recovery.matchedName ?? undefined,
        description: selector.description,
      }
    : undefined;

  return {
    ref: recovery.ref,
    recovered: true,
    matchedSelector,
    confidence: recovery.confidence,
    note: recovery.note,
    snapshotText,
  };
}

/** Best-effort extraction of the current page URL from a snapshot's header text. */
export function extractUrlFromSnapshot(snapshotText: string): string | null {
  const match = snapshotText.match(/https?:\/\/\S+/);
  return match ? match[0].replace(/[)\]"'.,]+$/, "") : null;
}
