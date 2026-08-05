import type { TokenUsageRecord, TokenUsageSource, UsageTotals } from "@testingmcp/shared";
import { prisma } from "./client";
import { serializeTokenUsage } from "./serializers";
import { calculateCostUsd, type RawUsage } from "../agent/pricing";

export async function recordUsage(
  projectId: string,
  source: TokenUsageSource,
  model: string,
  usage: RawUsage,
): Promise<TokenUsageRecord> {
  const costUsd = calculateCostUsd(model, usage);
  const record = await prisma.tokenUsage.create({
    data: {
      projectId,
      source,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      costUsd,
    },
  });
  return serializeTokenUsage(record);
}

export async function getUsageTotals(projectId: string): Promise<UsageTotals> {
  const agg = await prisma.tokenUsage.aggregate({
    where: { projectId },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      cacheReadTokens: true,
      cacheWriteTokens: true,
      costUsd: true,
    },
  });
  return {
    inputTokens: agg._sum.inputTokens ?? 0,
    outputTokens: agg._sum.outputTokens ?? 0,
    cacheReadTokens: agg._sum.cacheReadTokens ?? 0,
    cacheWriteTokens: agg._sum.cacheWriteTokens ?? 0,
    costUsd: agg._sum.costUsd ?? 0,
  };
}
