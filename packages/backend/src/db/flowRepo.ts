import type { Flow, FlowVersion, User } from "@prisma/client";
import type {
  FlowInput,
  FlowRecord,
  FlowSummary,
  FlowVersionRecord,
  TestStepInput,
  UserSummary,
} from "@testingmcp/shared";
import { prisma } from "./client";

function serializeUserSummary(user: User): UserSummary {
  return { id: user.id, username: user.username, role: user.role === "admin" ? "admin" : "member" };
}

export function serializeFlowVersion(version: FlowVersion & { createdBy: User | null }): FlowVersionRecord {
  return {
    id: version.id,
    flowId: version.flowId,
    version: version.version,
    steps: JSON.parse(version.steps) as TestStepInput[],
    note: version.note,
    createdBy: version.createdBy ? serializeUserSummary(version.createdBy) : null,
    createdAt: version.createdAt.toISOString(),
  };
}

export function serializeFlow(
  flow: Flow & { createdBy: User | null; versions: (FlowVersion & { createdBy: User | null })[] },
): FlowRecord {
  const versions = flow.versions.slice().sort((a, b) => a.version - b.version);
  return {
    id: flow.id,
    projectId: flow.projectId,
    name: flow.name,
    description: flow.description,
    createdBy: flow.createdBy ? serializeUserSummary(flow.createdBy) : null,
    versions: versions.map(serializeFlowVersion),
    createdAt: flow.createdAt.toISOString(),
    updatedAt: flow.updatedAt.toISOString(),
  };
}

function serializeFlowSummary(
  flow: Flow & { createdBy: User | null; versions: FlowVersion[] },
): FlowSummary {
  const latest = flow.versions.slice().sort((a, b) => b.version - a.version)[0];
  const latestSteps = latest ? (JSON.parse(latest.steps) as TestStepInput[]) : [];
  return {
    id: flow.id,
    projectId: flow.projectId,
    name: flow.name,
    description: flow.description,
    createdBy: flow.createdBy ? serializeUserSummary(flow.createdBy) : null,
    latestVersion: latest?.version ?? 0,
    latestStepCount: latestSteps.length,
    createdAt: flow.createdAt.toISOString(),
    updatedAt: flow.updatedAt.toISOString(),
  };
}

export async function listFlows(projectId: string): Promise<FlowSummary[]> {
  const flows = await prisma.flow.findMany({
    where: { projectId },
    include: { createdBy: true, versions: true },
    orderBy: { updatedAt: "desc" },
  });
  return flows.map(serializeFlowSummary);
}

export async function getFlow(flowId: string): Promise<FlowRecord | null> {
  const flow = await prisma.flow.findUnique({
    where: { id: flowId },
    include: { createdBy: true, versions: { include: { createdBy: true } } },
  });
  return flow ? serializeFlow(flow) : null;
}

export async function createFlow(
  projectId: string,
  input: FlowInput,
  steps: TestStepInput[],
  createdById?: string,
): Promise<FlowRecord> {
  const flow = await prisma.flow.create({
    data: {
      projectId,
      name: input.name,
      description: input.description ?? null,
      createdById: createdById ?? null,
      versions: {
        create: [{ version: 1, steps: JSON.stringify(steps), createdById: createdById ?? null }],
      },
    },
    include: { createdBy: true, versions: { include: { createdBy: true } } },
  });
  return serializeFlow(flow);
}

/** Creates the next immutable version for an existing flow -- never mutates
 * a prior version, so test cases that already inserted an older one keep
 * running exactly what they inserted (see TestStep.sourceFlowVersionId). */
export async function createFlowVersion(
  flowId: string,
  steps: TestStepInput[],
  note: string | null,
  createdById?: string,
): Promise<FlowVersionRecord> {
  const latest = await prisma.flowVersion.findFirst({ where: { flowId }, orderBy: { version: "desc" } });
  const nextVersion = (latest?.version ?? 0) + 1;
  const version = await prisma.flowVersion.create({
    data: { flowId, version: nextVersion, steps: JSON.stringify(steps), note, createdById: createdById ?? null },
    include: { createdBy: true },
  });
  await prisma.flow.update({ where: { id: flowId }, data: { updatedAt: new Date() } });
  return serializeFlowVersion(version);
}

export async function updateFlowMetadata(
  flowId: string,
  input: Partial<FlowInput>,
): Promise<FlowRecord | null> {
  const existing = await prisma.flow.findUnique({ where: { id: flowId } });
  if (!existing) return null;
  const flow = await prisma.flow.update({
    where: { id: flowId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
    include: { createdBy: true, versions: { include: { createdBy: true } } },
  });
  return serializeFlow(flow);
}

export async function deleteFlow(flowId: string): Promise<void> {
  await prisma.flow.delete({ where: { id: flowId } }).catch(() => null);
}

/** Latest version number for each given flow id -- used to tell a test
 * case's editor whether a step's `sourceFlowVersionId` is stale. */
export async function getLatestVersionNumbers(flowIds: string[]): Promise<Map<string, number>> {
  if (flowIds.length === 0) return new Map();
  const versions = await prisma.flowVersion.findMany({
    where: { flowId: { in: flowIds } },
    select: { flowId: true, version: true },
  });
  const latest = new Map<string, number>();
  for (const v of versions) {
    const current = latest.get(v.flowId) ?? 0;
    if (v.version > current) latest.set(v.flowId, v.version);
  }
  return latest;
}
