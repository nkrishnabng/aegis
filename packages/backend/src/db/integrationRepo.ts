import type { Integration } from "@prisma/client";
import type { IntegrationInput, IntegrationSummary, IntegrationType } from "@testingmcp/shared";
import { prisma } from "./client";
import { decryptSecret, encryptSecret } from "../utils/crypto";
import type { DecryptedIntegrationConfig } from "../integrations/types";

function serialize(row: Integration): IntegrationSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as IntegrationType,
    baseUrl: row.baseUrl,
    email: row.email,
    projectKey: row.projectKey,
    hasApiToken: row.apiTokenEncrypted.length > 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getIntegration(
  projectId: string,
  type: IntegrationType,
): Promise<IntegrationSummary | null> {
  const row = await prisma.integration.findUnique({ where: { projectId_type: { projectId, type } } });
  return row ? serialize(row) : null;
}

/** `apiToken` is optional on `input` so an admin can update baseUrl/email/
 * projectKey without being forced to re-enter (and thus rotate) the token
 * every time -- required only the first time (there's no existing token to
 * fall back to yet). */
export async function upsertIntegration(
  projectId: string,
  type: IntegrationType,
  input: Omit<IntegrationInput, "apiToken"> & { apiToken?: string },
): Promise<IntegrationSummary> {
  const existing = await prisma.integration.findUnique({ where: { projectId_type: { projectId, type } } });
  if (!existing && !input.apiToken) {
    throw new Error("An API token is required the first time you configure this integration.");
  }
  const row = await prisma.integration.upsert({
    where: { projectId_type: { projectId, type } },
    create: {
      projectId,
      type,
      baseUrl: input.baseUrl,
      email: input.email,
      projectKey: input.projectKey,
      apiTokenEncrypted: encryptSecret(input.apiToken!),
    },
    update: {
      baseUrl: input.baseUrl,
      email: input.email,
      projectKey: input.projectKey,
      ...(input.apiToken ? { apiTokenEncrypted: encryptSecret(input.apiToken) } : {}),
    },
  });
  return serialize(row);
}

/** Resolves an integration for actually pushing an issue, decrypting its API
 * token server-side only -- callers must never forward the returned
 * `apiToken` back over the wire or into chat/LLM context (mirrors
 * environmentRepo.ts's getEnvironmentForExecution). */
export async function getIntegrationForPush(
  projectId: string,
  type: IntegrationType,
): Promise<DecryptedIntegrationConfig | null> {
  const row = await prisma.integration.findUnique({ where: { projectId_type: { projectId, type } } });
  if (!row) return null;
  return {
    type: row.type as IntegrationType,
    baseUrl: row.baseUrl,
    email: row.email,
    projectKey: row.projectKey,
    apiToken: decryptSecret(row.apiTokenEncrypted),
  };
}
