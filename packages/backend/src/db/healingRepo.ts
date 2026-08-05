import type { ElementSelector, HealingEventRecord } from "@testingmcp/shared";
import { prisma } from "./client";
import { serializeHealingEvent } from "./serializers";

export async function createHealingEvent(input: {
  testStepId: string;
  testRunResultId: string;
  oldSelector: ElementSelector;
  newSelector: ElementSelector;
  confidence: "high" | "low";
  note: string;
  screenshotPath?: string | null;
}): Promise<HealingEventRecord> {
  const row = await prisma.healingEvent.create({
    data: {
      testStepId: input.testStepId,
      testRunResultId: input.testRunResultId,
      oldSelector: JSON.stringify(input.oldSelector),
      newSelector: JSON.stringify(input.newSelector),
      confidence: input.confidence,
      note: input.note,
      screenshotId: input.screenshotPath ?? null,
    },
  });
  return serializeHealingEvent(row);
}

export async function listPendingHealingEvents(projectId: string): Promise<HealingEventRecord[]> {
  const rows = await prisma.healingEvent.findMany({
    where: { approved: false, dismissed: false, testStep: { testCase: { projectId } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeHealingEvent);
}

export async function approveHealingEvent(
  id: string,
  makePrimary: boolean,
): Promise<HealingEventRecord | null> {
  const event = await prisma.healingEvent.findUnique({ where: { id } });
  if (!event) return null;

  const step = await prisma.testStep.findUniqueOrThrow({ where: { id: event.testStepId } });
  const existingCandidates: ElementSelector[] = step.locatorCandidates
    ? JSON.parse(step.locatorCandidates)
    : [];
  const newSelector = JSON.parse(event.newSelector) as ElementSelector;

  await prisma.testStep.update({
    where: { id: step.id },
    data: {
      locatorCandidates: JSON.stringify([...existingCandidates, newSelector]),
      ...(makePrimary ? { selector: event.newSelector } : {}),
    },
  });

  const updated = await prisma.healingEvent.update({ where: { id }, data: { approved: true } });
  return serializeHealingEvent(updated);
}

export async function dismissHealingEvent(id: string): Promise<HealingEventRecord | null> {
  const event = await prisma.healingEvent.findUnique({ where: { id } });
  if (!event) return null;
  const updated = await prisma.healingEvent.update({ where: { id }, data: { dismissed: true } });
  return serializeHealingEvent(updated);
}
