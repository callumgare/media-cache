import {
  type LiaseQueryOptions,
  loadSecretsIntoOptions,
} from "@@/server/lib/liase/run-query";
import {
  decryptSecrets,
  decryptValue,
  encryptSecrets,
  encryptValue,
} from "@@/server/lib/secrets-encryption";
import { db, dbSchema } from "@@/server/utils/drizzle";
import { eq, isNotNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_REQUEST,
  createTestLiaseQuery,
  truncateAll,
} from "./fixtures/helpers";

beforeEach(truncateAll);

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

async function createTestSecret(
  overrides: Partial<typeof dbSchema.querySecret.$inferInsert> = {},
) {
  const [row] = await db
    .insert(dbSchema.querySecret)
    .values({
      label: "Test Secret",
      liaseSourceId: "test-source",
      secretFieldName: "apiKey",
      secretFieldType: "string",
      encryptedValue: encryptValue("default-value"),
      updatedAt: new Date(),
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("Failed to create test secret");
  return row;
}

async function createTestLiaseQueryWithMappings(
  secretMappings: Record<string, number>,
) {
  const [row] = await db
    .insert(dbSchema.liaseQuery)
    .values({
      title: "Test Query",
      requestOptions: TEST_REQUEST,
      schedule: 0,
      updatedAt: new Date(),
      secretMappings,
    })
    .returning();
  if (!row) throw new Error("Failed to create test liase query");
  return row;
}

// ---------------------------------------------------------------------------
// encryptValue / decryptValue
// ---------------------------------------------------------------------------

describe("encryptValue / decryptValue — round-trip", () => {
  it("round-trips a simple string", () => {
    const value = "my-api-key";
    expect(decryptValue(encryptValue(value))).toBe(value);
  });

  it("round-trips an empty string", () => {
    expect(decryptValue(encryptValue(""))).toBe("");
  });

  it("round-trips a string with special characters", () => {
    const value = 'pass"word\nwith\ttabs🔑';
    expect(decryptValue(encryptValue(value))).toBe(value);
  });

  it("produces different ciphertext on each call (random IV)", () => {
    const e1 = encryptValue("same");
    const e2 = encryptValue("same");
    expect(e1).not.toBe(e2);
    // Both still decrypt to the original value
    expect(decryptValue(e1)).toBe("same");
    expect(decryptValue(e2)).toBe("same");
  });

  it("rejects a tampered ciphertext (auth tag mismatch)", () => {
    const payload = JSON.parse(encryptValue("original"));
    const ct = Buffer.from(payload.ct as string, "base64");
    ct[0] ^= 0xff;
    payload.ct = ct.toString("base64");
    expect(() => decryptValue(JSON.stringify(payload))).toThrow();
  });

  it("rejects a tampered auth tag", () => {
    const payload = JSON.parse(encryptValue("original"));
    const at = Buffer.from(payload.at as string, "base64");
    at[0] ^= 0xff;
    payload.at = at.toString("base64");
    expect(() => decryptValue(JSON.stringify(payload))).toThrow();
  });
});

describe("encryptValue — missing key", () => {
  it("throws a clear error when SECRETS_ENCRYPTION_KEY is not set", () => {
    vi.stubEnv("SECRETS_ENCRYPTION_KEY", "");
    try {
      expect(() => encryptValue("test")).toThrow("SECRETS_ENCRYPTION_KEY");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ---------------------------------------------------------------------------
// encryptSecrets / decryptSecrets  (legacy multi-key encryption)
// ---------------------------------------------------------------------------

describe("encryptSecrets / decryptSecrets — round-trip", () => {
  it("round-trips a secrets object", () => {
    const secrets = { apiKey: "key-123", token: "tok-abc" };
    expect(decryptSecrets(encryptSecrets(secrets))).toEqual(secrets);
  });

  it("round-trips an empty object", () => {
    expect(decryptSecrets(encryptSecrets({}))).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// query_secret table — CRUD
// ---------------------------------------------------------------------------

describe("query_secret table — CRUD", () => {
  it("creates and retrieves a secret", async () => {
    const secret = await createTestSecret({
      label: "My API Key",
      liaseSourceId: "reddit",
      secretFieldName: "clientSecret",
      secretFieldType: "string",
      encryptedValue: encryptValue("abc123"),
    });

    const found = await db.query.querySecret.findFirst({
      where: (s, { eq }) => eq(s.id, secret.id),
    });

    expect(found?.label).toBe("My API Key");
    expect(found?.liaseSourceId).toBe("reddit");
    expect(found?.secretFieldName).toBe("clientSecret");
    expect(found?.secretFieldType).toBe("string");
    if (!found) throw new Error("Expected to find secret");
    expect(decryptValue(found.encryptedValue)).toBe("abc123");
  });

  it("stores the value encrypted (raw column is not plaintext)", async () => {
    const plainValue = "super-secret-token";
    const secret = await createTestSecret({
      encryptedValue: encryptValue(plainValue),
    });

    expect(secret.encryptedValue).not.toBe(plainValue);
    expect(secret.encryptedValue).not.toContain(plainValue);
  });

  it("lists multiple secrets ordered by creation time", async () => {
    await createTestSecret({ label: "Key A" });
    await createTestSecret({ label: "Key B" });

    const all = await db.query.querySecret.findMany({
      orderBy: (s, { asc }) => [asc(s.createdAt)],
    });

    expect(all).toHaveLength(2);
    expect(all.map((s) => s.label)).toEqual(["Key A", "Key B"]);
  });

  it("updates a secret's label", async () => {
    const secret = await createTestSecret({ label: "Old Label" });

    await db
      .update(dbSchema.querySecret)
      .set({ label: "New Label", updatedAt: new Date() })
      .where(eq(dbSchema.querySecret.id, secret.id));

    const found = await db.query.querySecret.findFirst({
      where: (s, { eq }) => eq(s.id, secret.id),
    });
    expect(found?.label).toBe("New Label");
  });

  it("updates a secret's encrypted value", async () => {
    const secret = await createTestSecret({
      encryptedValue: encryptValue("old-value"),
    });

    await db
      .update(dbSchema.querySecret)
      .set({ encryptedValue: encryptValue("new-value"), updatedAt: new Date() })
      .where(eq(dbSchema.querySecret.id, secret.id));

    const found = await db.query.querySecret.findFirst({
      where: (s, { eq }) => eq(s.id, secret.id),
    });
    if (!found) throw new Error("Expected to find secret");
    expect(decryptValue(found.encryptedValue)).toBe("new-value");
  });

  it("deletes a secret by id", async () => {
    const secret = await createTestSecret();

    await db
      .delete(dbSchema.querySecret)
      .where(eq(dbSchema.querySecret.id, secret.id));

    const found = await db.query.querySecret.findFirst({
      where: (s, { eq }) => eq(s.id, secret.id),
    });
    expect(found).toBeUndefined();
  });

  it("allows multiple secrets for the same source and field (different labels/values)", async () => {
    await createTestSecret({
      label: "Account A",
      encryptedValue: encryptValue("val-a"),
    });
    await createTestSecret({
      label: "Account B",
      encryptedValue: encryptValue("val-b"),
    });

    const all = await db.query.querySecret.findMany({
      orderBy: (s, { asc }) => [asc(s.createdAt)],
    });

    expect(all).toHaveLength(2);
    expect(all.map((s) => s.label)).toEqual(["Account A", "Account B"]);
    const [first, second] = all;
    if (!first || !second) throw new Error("Expected two secrets");
    expect(decryptValue(first.encryptedValue)).toBe("val-a");
    expect(decryptValue(second.encryptedValue)).toBe("val-b");
  });
});

// ---------------------------------------------------------------------------
// loadSecretsIntoOptions
// ---------------------------------------------------------------------------

describe("loadSecretsIntoOptions", () => {
  it("does nothing when secretMappings is null", async () => {
    const query = await createTestLiaseQuery();
    const options: LiaseQueryOptions = {};
    await loadSecretsIntoOptions(query, options);
    expect(options).toEqual({});
  });

  it("resolves a single mapped secret into options.secrets", async () => {
    const secret = await createTestSecret({
      secretFieldName: "apiKey",
      encryptedValue: encryptValue("my-key"),
    });
    const query = await createTestLiaseQueryWithMappings({ apiKey: secret.id });

    const options: LiaseQueryOptions = {};
    await loadSecretsIntoOptions(query, options);

    expect(options.secrets).toEqual({ apiKey: "my-key" });
  });

  it("resolves multiple mapped secrets into options.secrets", async () => {
    const keySecret = await createTestSecret({
      secretFieldName: "apiKey",
      encryptedValue: encryptValue("key-val"),
    });
    const tokenSecret = await createTestSecret({
      secretFieldName: "token",
      secretFieldType: "string",
      encryptedValue: encryptValue("tok-val"),
    });
    const query = await createTestLiaseQueryWithMappings({
      apiKey: keySecret.id,
      token: tokenSecret.id,
    });

    const options: LiaseQueryOptions = {};
    await loadSecretsIntoOptions(query, options);

    expect(options.secrets).toEqual({ apiKey: "key-val", token: "tok-val" });
  });

  it("silently skips a mapping whose secret ID no longer exists in the DB", async () => {
    const secret = await createTestSecret({
      secretFieldName: "apiKey",
      encryptedValue: encryptValue("key"),
    });
    const deletedId = secret.id;
    await db
      .delete(dbSchema.querySecret)
      .where(eq(dbSchema.querySecret.id, deletedId));

    const query = await createTestLiaseQueryWithMappings({ apiKey: deletedId });

    const options: LiaseQueryOptions = {};
    await loadSecretsIntoOptions(query, options);

    expect(options).toEqual({});
  });

  it("merges mapped secrets with pre-existing options.secrets", async () => {
    const secret = await createTestSecret({
      secretFieldName: "apiKey",
      encryptedValue: encryptValue("mapped-key"),
    });
    const query = await createTestLiaseQueryWithMappings({ apiKey: secret.id });

    const options: LiaseQueryOptions = {
      secrets: { existing: "pre-existing" },
    };
    await loadSecretsIntoOptions(query, options);

    expect(options.secrets).toEqual({
      existing: "pre-existing",
      apiKey: "mapped-key",
    });
  });

  it("overrides a pre-existing secret with the same field name", async () => {
    const secret = await createTestSecret({
      secretFieldName: "apiKey",
      encryptedValue: encryptValue("new-key"),
    });
    const query = await createTestLiaseQueryWithMappings({ apiKey: secret.id });

    const options: LiaseQueryOptions = { secrets: { apiKey: "old-key" } };
    await loadSecretsIntoOptions(query, options);

    expect(options.secrets?.apiKey).toBe("new-key");
  });
});

// ---------------------------------------------------------------------------
// Delete-protection: detect secrets still referenced by secretMappings
// ---------------------------------------------------------------------------

describe("delete — in-use detection logic", () => {
  it("detects a secret referenced in a query's secretMappings", async () => {
    const secret = await createTestSecret();
    await createTestLiaseQueryWithMappings({ apiKey: secret.id });

    const queriesWithMappings = await db.query.liaseQuery.findMany({
      where: isNotNull(dbSchema.liaseQuery.secretMappings),
      columns: { id: true, title: true, secretMappings: true },
    });
    const inUse = queriesWithMappings.some(
      (q) =>
        q.secretMappings && Object.values(q.secretMappings).includes(secret.id),
    );

    expect(inUse).toBe(true);
  });

  it("does not flag an unreferenced secret as in-use", async () => {
    const usedSecret = await createTestSecret({ label: "Used" });
    const unusedSecret = await createTestSecret({ label: "Unused" });
    await createTestLiaseQueryWithMappings({ apiKey: usedSecret.id });

    const queriesWithMappings = await db.query.liaseQuery.findMany({
      where: isNotNull(dbSchema.liaseQuery.secretMappings),
      columns: { id: true, title: true, secretMappings: true },
    });
    const inUse = queriesWithMappings.some(
      (q) =>
        q.secretMappings &&
        Object.values(q.secretMappings).includes(unusedSecret.id),
    );

    expect(inUse).toBe(false);
  });

  it("a secret referenced under a different field name is still detected as in-use", async () => {
    const secret = await createTestSecret({ secretFieldName: "token" });
    await createTestLiaseQueryWithMappings({ token: secret.id });

    const queriesWithMappings = await db.query.liaseQuery.findMany({
      where: isNotNull(dbSchema.liaseQuery.secretMappings),
      columns: { id: true, title: true, secretMappings: true },
    });
    const inUse = queriesWithMappings.some(
      (q) =>
        q.secretMappings && Object.values(q.secretMappings).includes(secret.id),
    );

    expect(inUse).toBe(true);
  });

  it("deleting an unreferenced secret does not throw", async () => {
    const secret = await createTestSecret();

    await expect(
      db
        .delete(dbSchema.querySecret)
        .where(eq(dbSchema.querySecret.id, secret.id)),
    ).resolves.not.toThrow();

    const found = await db.query.querySecret.findFirst({
      where: (s, { eq }) => eq(s.id, secret.id),
    });
    expect(found).toBeUndefined();
  });

  it("secret_mappings JSONB has no FK constraint so deleting a used secret is permitted at DB level", async () => {
    // The application layer enforces in-use protection; the DB does not (no FK on JSONB).
    // This test verifies that expectation so we don't accidentally add a DB-level constraint.
    const secret = await createTestSecret();
    await createTestLiaseQueryWithMappings({ apiKey: secret.id });

    await expect(
      db
        .delete(dbSchema.querySecret)
        .where(eq(dbSchema.querySecret.id, secret.id)),
    ).resolves.not.toThrow();
  });
});
