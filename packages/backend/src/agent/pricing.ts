// Per-million-token USD rates used to estimate API spend. These are
// reasonable placeholder rates following Anthropic's published tiering
// pattern (opus > sonnet > haiku; cache writes ~1.25x base input; cache
// reads ~0.1x base input) -- verify/update against the current pricing at
// https://www.anthropic.com/pricing before relying on these figures for
// real billing reconciliation.
interface ModelRates {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const MODEL_RATES: Record<string, ModelRates> = {
  opus: { input: 15.0, output: 75.0, cacheWrite: 18.75, cacheRead: 1.5 },
  sonnet: { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 0.8, output: 4.0, cacheWrite: 1.0, cacheRead: 0.08 },
};

const DEFAULT_RATES = MODEL_RATES.sonnet;

function resolveRates(model: string): ModelRates {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return MODEL_RATES.opus;
  if (lower.includes("haiku")) return MODEL_RATES.haiku;
  if (lower.includes("sonnet")) return MODEL_RATES.sonnet;
  return DEFAULT_RATES;
}

export interface RawUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function calculateCostUsd(model: string, usage: RawUsage): number {
  const rates = resolveRates(model);
  const cost =
    (usage.inputTokens / 1_000_000) * rates.input +
    (usage.outputTokens / 1_000_000) * rates.output +
    (usage.cacheReadTokens / 1_000_000) * rates.cacheRead +
    (usage.cacheWriteTokens / 1_000_000) * rates.cacheWrite;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
