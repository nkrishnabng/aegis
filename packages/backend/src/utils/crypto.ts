import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../env";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  if (!env.credentialEncryptionKey) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is not set -- required to store environment credentials. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  const key = Buffer.from(env.credentialEncryptionKey, "hex");
  if (key.length !== 32) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must be a 32-byte value encoded as 64 hex characters.");
  }
  return key;
}

interface EncryptedPayload {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const payload: EncryptedPayload = {
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
  return JSON.stringify(payload);
}

export function decryptSecret(serialized: string): string {
  const key = getKey();
  const payload = JSON.parse(serialized) as EncryptedPayload;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
