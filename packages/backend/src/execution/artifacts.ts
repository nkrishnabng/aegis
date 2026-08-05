import fs from "node:fs/promises";
import path from "node:path";

/** Recursively finds the most-recently-modified file under `rootDir` whose
 * basename satisfies `predicate` and whose mtime is at or after `sinceMs`
 * (pass `Date.now()` captured just before the triggering tool call, so a
 * stale file from an earlier step/session in the same session-scoped output
 * dir is never picked up in place of a fresh one). Returns null if the
 * directory doesn't exist yet or nothing matches -- never throws. */
export async function findNewestFile(
  rootDir: string,
  predicate: (basename: string) => boolean,
  sinceMs: number,
): Promise<string | null> {
  let best: { file: string; mtimeMs: number } | null = null;

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!predicate(entry.name)) continue;
      const stat = await fs.stat(full).catch(() => null);
      if (!stat || stat.mtimeMs < sinceMs) continue;
      if (!best || stat.mtimeMs > best.mtimeMs) {
        best = { file: full, mtimeMs: stat.mtimeMs };
      }
    }
  }

  await walk(rootDir);
  return best ? (best as { file: string; mtimeMs: number }).file : null;
}
