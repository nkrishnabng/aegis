import type { UsageTotals } from "@testingmcp/shared";

function formatCost(costUsd: number): string {
  if (costUsd === 0) return "$0.00";
  if (costUsd < 0.01) return `$${costUsd.toFixed(6)}`;
  return `$${costUsd.toFixed(4)}`;
}

function formatTokens(n: number): string {
  return n.toLocaleString();
}

export function UsagePanel({ totals }: { totals: UsageTotals | null }) {
  if (!totals) return null;
  const totalTokens =
    totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          AI token usage &amp; cost
        </h2>
        <strong style={{ fontSize: "1.1em" }}>{formatCost(totals.costUsd)}</strong>
      </div>
      <div
        className="muted"
        style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: "0.9em" }}
      >
        <span>Input: {formatTokens(totals.inputTokens)}</span>
        <span>Output: {formatTokens(totals.outputTokens)}</span>
        <span>Cache read: {formatTokens(totals.cacheReadTokens)}</span>
        <span>Cache write: {formatTokens(totals.cacheWriteTokens)}</span>
        <span>Total: {formatTokens(totalTokens)} tokens</span>
      </div>
    </div>
  );
}
