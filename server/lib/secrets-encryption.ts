import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const SCRYPT_SALT = "media-cache-secrets-v1";

function getEncryptionKey(): Buffer {
  const keyStr = process.env.SECRETS_ENCRYPTION_KEY;
  if (!keyStr) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY environment variable must be set to use query secret management. " +
        "Set it to a random string of at least 32 characters.",
    );
  }
  return scryptSync(keyStr, SCRYPT_SALT, 32);
}

type EncryptedPayload = {
  v: number;
  iv: string;
  at: string;
  ct: string;
};

export function encryptSecrets(secrets: Record<string, string>): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(secrets);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    v: 1,
    iv: iv.toString("base64"),
    at: authTag.toString("base64"),
    ct: encrypted.toString("base64"),
  };
  return JSON.stringify(payload);
}

export function decryptSecrets(encryptedData: string): Record<string, string> {
  const key = getEncryptionKey();
  const { iv, at, ct } = JSON.parse(encryptedData) as EncryptedPayload;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(at, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ct, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as Record<string, string>;
}

export function getSecretKeys(encryptedData: string): string[] {
  return Object.keys(decryptSecrets(encryptedData));
}

export function encryptValue(value: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    v: 1,
    iv: iv.toString("base64"),
    at: authTag.toString("base64"),
    ct: encrypted.toString("base64"),
  };
  return JSON.stringify(payload);
}

export function decryptValue(encryptedData: string): string {
  const key = getEncryptionKey();
  const { iv, at, ct } = JSON.parse(encryptedData) as EncryptedPayload;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(at, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ct, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
