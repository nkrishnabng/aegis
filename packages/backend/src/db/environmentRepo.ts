import type { EnvironmentInput, EnvironmentRecord } from "@testingmcp/shared";
import { prisma } from "./client";
import { serializeEnvironment } from "./serializers";
import { decryptSecret, encryptSecret } from "../utils/crypto";

export async function listEnvironments(projectId: string): Promise<EnvironmentRecord[]> {
  const rows = await prisma.environment.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  return rows.map(serializeEnvironment);
}

export async function createEnvironment(
  projectId: string,
  input: EnvironmentInput,
): Promise<EnvironmentRecord> {
  const row = await prisma.environment.create({
    data: {
      projectId,
      name: input.name,
      baseUrl: input.baseUrl,
      browser: input.browser,
      headless: input.headless,
      viewportWidth: input.viewportWidth,
      viewportHeight: input.viewportHeight,
      isDefault: input.isDefault,
    },
  });
  return serializeEnvironment(row);
}

export async function updateEnvironment(
  id: string,
  input: Partial<EnvironmentInput>,
): Promise<EnvironmentRecord> {
  const row = await prisma.environment.update({ where: { id }, data: input });
  return serializeEnvironment(row);
}

export async function deleteEnvironment(id: string): Promise<void> {
  await prisma.environment.delete({ where: { id } });
}

export async function setEnvironmentCredentials(
  id: string,
  values: Record<string, string>,
): Promise<EnvironmentRecord> {
  const row = await prisma.environment.update({
    where: { id },
    data: { credentialsEncrypted: encryptSecret(JSON.stringify(values)) },
  });
  return serializeEnvironment(row);
}

export interface ExecutionEnvironmentConfig {
  baseUrl: string;
  browser: "chromium" | "firefox" | "webkit";
  headless: boolean;
  viewportWidth: number;
  viewportHeight: number;
  credentials: Record<string, string>;
}

/** Resolves an environment for execution, decrypting its credentials
 * server-side only -- callers must never forward `credentials` back over the
 * wire or into chat/LLM context (substitution happens in the executor). */
export async function getEnvironmentForExecution(
  id: string,
): Promise<ExecutionEnvironmentConfig | null> {
  const row = await prisma.environment.findUnique({ where: { id } });
  if (!row) return null;
  const credentials = row.credentialsEncrypted
    ? (JSON.parse(decryptSecret(row.credentialsEncrypted)) as Record<string, string>)
    : {};
  return {
    baseUrl: row.baseUrl,
    browser: row.browser as ExecutionEnvironmentConfig["browser"],
    headless: row.headless,
    viewportWidth: row.viewportWidth,
    viewportHeight: row.viewportHeight,
    credentials,
  };
}
