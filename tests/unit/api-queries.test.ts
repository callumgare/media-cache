import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import deleteQueryHandler from "@@/server/api/admin/queries/[id]/index.delete";
import { getLiase } from "@@/server/lib/liase";
import { parseLiaseRequest } from "@@/server/lib/liase/parse-request";
import { db, dbSchema } from "@@/server/utils/drizzle";
import { eq } from "drizzle-orm";
import { createEvent } from "h3";
import { beforeEach, describe, expect, it } from "vitest";
import {
  TEST_REQUEST,
  TEST_REQUEST_WITH_COUNT,
  createTestLiaseQuery,
  runLiaseQuery,
  truncateAll,
} from "./fixtures/helpers";

// Replicates the stripping logic in EditQueryForm's `formattedFormValue`:
// when submitting, only keep fields that are part of the currently-selected
// handler's schema (plus source/queryType).
async function stripToHandlerFields(
  requestOptions: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { source, queryType } = requestOptions;
  if (typeof source !== "string" || typeof queryType !== "string") {
    return requestOptions;
  }
  const liase = await getLiase();
  const handler = liase.getRequestHandler(source, queryType);
  const jsonSchema = handler.requestSchema.toJSONSchema() as {
    properties?: Record<string, unknown>;
  };
  const knownFields = new Set([
    "source",
    "queryType",
    ...Object.keys(jsonSchema.properties ?? {}),
  ]);
  return Object.fromEntries(
    Object.entries(requestOptions).filter(
      ([key, value]) => value !== null && knownFields.has(key),
    ),
  );
}

beforeEach(truncateAll);

async function getQuery(id: number) {
  const row = await db.query.liaseQuery.findFirst({
    where: (q, { eq }) => eq(q.id, id),
  });
  if (!row) throw new Error(`Query ${id} not found`);
  return row;
}

async function updateQueryVariations(
  id: number,
  queryVariations: dbSchema.QueryVariation[] | null,
) {
  await db
    .update(dbSchema.liaseQuery)
    .set({ queryVariations, updatedAt: new Date() })
    .where(eq(dbSchema.liaseQuery.id, id));
}

describe("query variations — saving", () => {
  it("saves a query with no variations", async () => {
    const q = await createTestLiaseQuery();
    const saved = await getQuery(q.id);
    expect(saved.queryVariations).toBeNull();
  });

  it("saves a single variation with one field and one value", async () => {
    const q = await createTestLiaseQuery();
    const variations: dbSchema.QueryVariation[] = [
      { id: "var-1", fieldOverrides: { keyword: ["cats"] } },
    ];
    await updateQueryVariations(q.id, variations);

    const saved = await getQuery(q.id);
    expect(saved.queryVariations).toEqual(variations);
  });

  it("saves a single variation with one field and multiple values", async () => {
    const q = await createTestLiaseQuery();
    const variations: dbSchema.QueryVariation[] = [
      { id: "var-1", fieldOverrides: { keyword: ["cats", "dogs", "birds"] } },
    ];
    await updateQueryVariations(q.id, variations);

    const saved = await getQuery(q.id);
    expect(saved.queryVariations).toEqual(variations);
  });

  it("saves a single variation with several fields, some with multiple values", async () => {
    const q = await createTestLiaseQuery();
    const variations: dbSchema.QueryVariation[] = [
      {
        id: "var-1",
        fieldOverrides: {
          keyword: ["cats", "dogs"],
          sort: ["recent"],
          limit: [10, 50, 100],
          includeAudio: [true, false],
        },
      },
    ];
    await updateQueryVariations(q.id, variations);

    const saved = await getQuery(q.id);
    expect(saved.queryVariations).toEqual(variations);
  });

  it("saves multiple variations each with different fields", async () => {
    const q = await createTestLiaseQuery();
    const variations: dbSchema.QueryVariation[] = [
      { id: "var-1", fieldOverrides: { keyword: ["cats"] } },
      { id: "var-2", fieldOverrides: { keyword: ["dogs"] } },
      { id: "var-3", fieldOverrides: { sort: ["recent", "popular"] } },
    ];
    await updateQueryVariations(q.id, variations);

    const saved = await getQuery(q.id);
    expect(saved.queryVariations).toEqual(variations);
  });

  it("saves multiple variations where some share fields with multiple values", async () => {
    const q = await createTestLiaseQuery();
    const variations: dbSchema.QueryVariation[] = [
      {
        id: "var-1",
        fieldOverrides: {
          keyword: ["cats", "dogs"],
          sort: ["recent", "popular"],
        },
      },
      {
        id: "var-2",
        fieldOverrides: {
          keyword: ["birds"],
          limit: [10, 50],
        },
      },
      {
        id: "var-3",
        fieldOverrides: {
          sort: ["oldest"],
          includeAudio: [true, false],
        },
      },
    ];
    await updateQueryVariations(q.id, variations);

    const saved = await getQuery(q.id);
    expect(saved.queryVariations).toEqual(variations);
  });

  it("saves a boolean field variation limited to two values", async () => {
    const q = await createTestLiaseQuery();
    const variations: dbSchema.QueryVariation[] = [
      { id: "var-1", fieldOverrides: { includeAudio: [true, false] } },
    ];
    await updateQueryVariations(q.id, variations);

    const saved = await getQuery(q.id);
    expect(saved.queryVariations).toEqual(variations);
  });

  it("updates variations on an existing query", async () => {
    const q = await createTestLiaseQuery();
    const initial: dbSchema.QueryVariation[] = [
      { id: "var-1", fieldOverrides: { keyword: ["cats"] } },
    ];
    await updateQueryVariations(q.id, initial);

    const updated: dbSchema.QueryVariation[] = [
      { id: "var-1", fieldOverrides: { keyword: ["cats", "dogs"] } },
      { id: "var-2", fieldOverrides: { sort: ["recent"] } },
    ];
    await updateQueryVariations(q.id, updated);

    const saved = await getQuery(q.id);
    expect(saved.queryVariations).toEqual(updated);
  });

  it("clears variations by setting them to null", async () => {
    const q = await createTestLiaseQuery();
    await updateQueryVariations(q.id, [
      { id: "var-1", fieldOverrides: { keyword: ["cats"] } },
    ]);
    await updateQueryVariations(q.id, null);

    const saved = await getQuery(q.id);
    expect(saved.queryVariations).toBeNull();
  });

  it("creates a new query with variations inline", async () => {
    const variations: dbSchema.QueryVariation[] = [
      {
        id: "var-a",
        fieldOverrides: { keyword: ["cats", "dogs"], sort: ["recent"] },
      },
      {
        id: "var-b",
        fieldOverrides: { limit: [25, 50, 100] },
      },
    ];

    const [row] = await db
      .insert(dbSchema.liaseQuery)
      .values({
        title: "Query with variations",
        requestOptions: TEST_REQUEST,
        schedule: 0,
        updatedAt: new Date(),
        queryVariations: variations,
      })
      .returning();

    if (!row) throw new Error("Insert failed");
    const saved = await getQuery(row.id);
    expect(saved.queryVariations).toEqual(variations);
  });
});

describe("query form — switching sources", () => {
  // These tests simulate the "stale fields" bug: the form retains field values
  // when the user switches to a different handler, and submits with the old
  // handler's fields still present.  The form fix strips unknown fields in
  // formattedFormValue before submitting; the tests verify both sides of that.

  it("stale fields from a switched handler fail validation if not stripped", async () => {
    // Represents what the buggy form would POST: keyword is a stale field left
    // over from test-handler-with-keyword, but we are now on test-handler.
    await expect(
      parseLiaseRequest({
        source: "test-source",
        queryType: "test-handler",
        keyword: "cats",
      }),
    ).rejects.toThrow();
  });

  it("saves successfully after switching from keyword handler to basic handler", async () => {
    // Simulate formValue.requestOptions after user fills keyword on
    // test-handler-with-keyword then switches to test-handler.
    const staleFormState: Record<string, unknown> = {
      source: "test-source",
      queryType: "test-handler",
      keyword: "cats", // stale
    };

    // formattedFormValue strips to the current handler's known fields
    const stripped = await stripToHandlerFields(staleFormState);

    await expect(parseLiaseRequest(stripped)).resolves.toMatchObject({
      source: "test-source",
      queryType: "test-handler",
    });
  });

  it("retains keyword value when the current handler supports it", async () => {
    // No stale fields here — the current handler knows about keyword.
    const formState: Record<string, unknown> = {
      source: "test-source",
      queryType: "test-handler-with-keyword",
      keyword: "dogs",
    };

    const stripped = await stripToHandlerFields(formState);

    await expect(parseLiaseRequest(stripped)).resolves.toMatchObject({
      source: "test-source",
      queryType: "test-handler-with-keyword",
      keyword: "dogs",
    });
  });

  it("saves to DB correctly after stripping stale fields from a handler switch", async () => {
    const staleFormState: Record<string, unknown> = {
      source: "test-source",
      queryType: "test-handler",
      keyword: "sunset", // stale
    };

    const stripped = await stripToHandlerFields(staleFormState);
    const parsed = await parseLiaseRequest(stripped);

    const [row] = await db
      .insert(dbSchema.liaseQuery)
      .values({
        title: "Switched handler query",
        requestOptions: parsed,
        schedule: 0,
        updatedAt: new Date(),
      })
      .returning();

    if (!row) throw new Error("Insert failed");
    const saved = await getQuery(row.id);
    expect(saved.requestOptions).toMatchObject({
      source: "test-source",
      queryType: "test-handler",
    });
    expect(saved.requestOptions).not.toHaveProperty("keyword");
  });

  it("saves to DB correctly when switching back to a handler that supports a field", async () => {
    // User filled keyword="cats" on test-handler-with-keyword, switched to
    // test-handler (stale keyword retained in form state), then switched back.
    const formStateAfterSwitchBack: Record<string, unknown> = {
      source: "test-source",
      queryType: "test-handler-with-keyword",
      keyword: "cats", // still present — valid for this handler
    };

    const stripped = await stripToHandlerFields(formStateAfterSwitchBack);
    const parsed = await parseLiaseRequest(stripped);

    const [row] = await db
      .insert(dbSchema.liaseQuery)
      .values({
        title: "Switched back query",
        requestOptions: parsed,
        schedule: 0,
        updatedAt: new Date(),
      })
      .returning();

    if (!row) throw new Error("Insert failed");
    const saved = await getQuery(row.id);
    expect(saved.requestOptions).toMatchObject({
      source: "test-source",
      queryType: "test-handler-with-keyword",
      keyword: "cats",
    });
  });
});

describe("query form — field values survive switching handlers and back", () => {
  // These tests model the in-memory form state (formValue.requestOptions) as a
  // plain object.  Switching handlers only changes source/queryType; the other
  // fields are left untouched in the state.  Only stripToHandlerFields (which
  // mirrors formattedFormValue) removes stale fields at submit time.

  it("keyword value is present in form state after switching away to a handler that lacks it", () => {
    // Start: on test-handler-with-keyword, user typed keyword="cats"
    const formState: Record<string, unknown> = {
      source: "test-source",
      queryType: "test-handler-with-keyword",
      keyword: "cats",
    };

    // User switches to test-handler — only queryType changes in formState
    formState.queryType = "test-handler";

    // The raw form state still carries keyword even though test-handler doesn't know it
    expect(formState).toHaveProperty("keyword", "cats");
  });

  it("keyword value is still present after switching back to the handler that supports it", () => {
    const formState: Record<string, unknown> = {
      source: "test-source",
      queryType: "test-handler-with-keyword",
      keyword: "cats",
    };

    // Switch away
    formState.queryType = "test-handler";
    // Switch back
    formState.queryType = "test-handler-with-keyword";

    expect(formState).toHaveProperty("keyword", "cats");
  });

  it("submitting while on the other handler strips the field", async () => {
    const formState: Record<string, unknown> = {
      source: "test-source",
      queryType: "test-handler-with-keyword",
      keyword: "cats",
    };

    // Switch away — form state retains keyword
    formState.queryType = "test-handler";
    expect(formState).toHaveProperty("keyword", "cats");

    // On submit, the form strips to the current handler's fields
    const submitted = await stripToHandlerFields(formState);
    expect(submitted).not.toHaveProperty("keyword");
    await expect(parseLiaseRequest(submitted)).resolves.toMatchObject({
      source: "test-source",
      queryType: "test-handler",
    });
  });

  it("submitting after switching back includes the retained field value", async () => {
    const formState: Record<string, unknown> = {
      source: "test-source",
      queryType: "test-handler-with-keyword",
      keyword: "cats",
    };

    // Switch away then back — keyword is preserved throughout
    formState.queryType = "test-handler";
    formState.queryType = "test-handler-with-keyword";

    const submitted = await stripToHandlerFields(formState);
    expect(submitted).toHaveProperty("keyword", "cats");
    await expect(parseLiaseRequest(submitted)).resolves.toMatchObject({
      source: "test-source",
      queryType: "test-handler-with-keyword",
      keyword: "cats",
    });
  });

  it("multiple fields survive switching and are each stripped/retained correctly", async () => {
    // Imagine a richer handler that has both keyword and a sort field.
    // We only have test-handler-with-keyword in the test plugin, so we simulate
    // a second field by adding it directly to formState (as the Vue form would).
    const formState: Record<string, unknown> = {
      source: "test-source",
      queryType: "test-handler-with-keyword",
      keyword: "cats",
      extraField: "some-value", // hypothetical extra field
    };

    // Switch to test-handler (neither keyword nor extraField is valid there)
    formState.queryType = "test-handler";

    // Both fields survive in raw state
    expect(formState).toHaveProperty("keyword", "cats");
    expect(formState).toHaveProperty("extraField", "some-value");

    // Submitted value strips both
    const submittedOnBasic = await stripToHandlerFields(formState);
    expect(submittedOnBasic).not.toHaveProperty("keyword");
    expect(submittedOnBasic).not.toHaveProperty("extraField");

    // Switch back — both still in form state
    formState.queryType = "test-handler-with-keyword";
    expect(formState).toHaveProperty("keyword", "cats");
    expect(formState).toHaveProperty("extraField", "some-value");

    // Submitted value includes keyword (known) but still strips extraField (unknown)
    const submittedOnKeyword = await stripToHandlerFields(formState);
    expect(submittedOnKeyword).toHaveProperty("keyword", "cats");
    expect(submittedOnKeyword).not.toHaveProperty("extraField");
  });
});

// ---------------------------------------------------------------------------
// Helpers for handler-level delete tests
// ---------------------------------------------------------------------------

function makeDeleteEvent(queryId: number) {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.url = `/api/admin/queries/${queryId}`;
  req.method = "DELETE";
  const res = new ServerResponse(req);
  const event = createEvent(req, res);
  event.context.params = { id: String(queryId) };
  return event;
}

describe("DELETE /api/admin/queries/:id", () => {
  it("deletes a query that has never been run", async () => {
    const q = await createTestLiaseQuery();
    await deleteQueryHandler(makeDeleteEvent(q.id));

    const found = await db.query.liaseQuery.findFirst({
      where: (r, { eq }) => eq(r.id, q.id),
    });
    expect(found).toBeUndefined();
  });

  it("deletes a query that has been run (has associated execution records)", async () => {
    // Bug: the handler only deletes the liaseQuery row directly. When the
    // query has been executed, liaseQueryExecution rows exist with a FK to
    // liaseQuery.id (no ON DELETE CASCADE), so the DELETE fails with a
    // foreign-key constraint violation.
    const q = await createTestLiaseQuery();
    await runLiaseQuery(q); // creates a liaseQueryExecution row

    await deleteQueryHandler(makeDeleteEvent(q.id));

    const found = await db.query.liaseQuery.findFirst({
      where: (r, { eq }) => eq(r.id, q.id),
    });
    expect(found).toBeUndefined();
  });
});

describe("query form — clearing number fields", () => {
  it("clears a number field when it has been removed from the submitted request options", async () => {
    // 1. Create a query with count explicitly set to 5.
    const [row] = await db
      .insert(dbSchema.liaseQuery)
      .values({
        title: "Query with count",
        requestOptions: { ...TEST_REQUEST_WITH_COUNT, count: 5 },
        schedule: 0,
        updatedAt: new Date(),
      })
      .returning();
    if (!row) throw new Error("Insert failed");

    const initial = await getQuery(row.id);
    expect(initial.requestOptions).toHaveProperty("count", 5);

    // 2. Simulate the user clearing the count field.
    //    formattedFormValue sets cleared fields to null then strips them,
    //    so the submitted object has no "count" key at all.
    const formState: Record<string, unknown> = {
      ...TEST_REQUEST_WITH_COUNT,
      count: null, // user cleared
    };
    const submitted = await stripToHandlerFields(formState);
    expect(submitted).not.toHaveProperty("count");

    // 3. Parse and save — mirrors what the update endpoint does.
    const parsed = await parseLiaseRequest(submitted);
    await db
      .update(dbSchema.liaseQuery)
      .set({ requestOptions: parsed, updatedAt: new Date() })
      .where(eq(dbSchema.liaseQuery.id, row.id));

    // 4. The saved query should not have count.
    const saved = await getQuery(row.id);
    expect(saved.requestOptions).not.toHaveProperty("count");
  });
});
