import util from "node:util";
import type { QueryVariation } from "@@/server/database/schema";
import { queryExecutionTaskSystem } from "@@/server/lib/liase/execution-tasks";
import { decryptValue } from "@@/server/lib/secrets-encryption";
import type { GenericRequest } from "@liase/core";
import { getLiaseQuery } from "../liase";
import {
  batchUpsertLiaseQueryMediaPage,
  createExecutionLogEntry,
  createLiaseQueryExecution,
  createOrUpdateCacheMedia,
  deleteCacheMediaEntry,
  deleteOldLiaseQueryMedia,
  getCacheMedia,
  getPreviousLiaseQueryExecution,
} from "./utils";

import { db } from "@@/server/utils/drizzle";
import { dbSchema } from "@@/server/utils/drizzle";
import {
  and,
  asc,
  count,
  eq,
  gt,
  isNull,
  max,
  min,
  ne,
  not,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export type LiaseQueryOptions = Parameters<
  typeof getLiaseQuery
>[0]["queryOptions"];

// Stages that can be persisted as a resume checkpoint.
// The value means "this stage has not yet completed – resume from here".
export type ResumeStage =
  | "fetching-liase-results"
  | "processing-added-or-updated"
  | "processing-removed"
  | "removing-previous-execution-results";

const resumeStageOrder: ResumeStage[] = [
  "fetching-liase-results",
  "processing-added-or-updated",
  "processing-removed",
  "removing-previous-execution-results",
];

/** Returns true when `stage` is at or after `resumeFrom` in the pipeline. */
function shouldRunStage(
  stage: ResumeStage,
  resumeFrom: ResumeStage | null,
): boolean {
  if (!resumeFrom) return true;
  return (
    resumeStageOrder.indexOf(stage) >= resumeStageOrder.indexOf(resumeFrom)
  );
}

function cartesianProduct<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) =>
      acc.flatMap((existing) => arr.map((item) => [...existing, item])),
    [[]],
  );
}

function expandVariation(
  baseRequest: GenericRequest,
  variation: QueryVariation,
): GenericRequest[] {
  const entries = Object.entries(variation.fieldOverrides).filter(
    ([, values]) => values.length > 0,
  );
  if (entries.length === 0) return [baseRequest];

  const fieldNames = entries.map(([name]) => name);
  const fieldValues = entries.map(([, values]) => values);
  const combinations = cartesianProduct(fieldValues);

  return combinations.map((combo) => {
    const overrides = Object.fromEntries(
      fieldNames.map((name, i) => [name, combo[i]]),
    );
    return { ...baseRequest, ...overrides } as GenericRequest;
  });
}

export function expandAllVariations(
  savedLiaseQuery: dbSchema.LiaseQuery,
): GenericRequest[] {
  const base = savedLiaseQuery.requestOptions;
  const variations = savedLiaseQuery.queryVariations;
  if (!variations || variations.length === 0) return [base];

  const allRequests: GenericRequest[] = [];
  for (const variation of variations) {
    allRequests.push(...expandVariation(base, variation));
  }
  return allRequests;
}

/**
 * Builds the LiaseQueryOptions for a saved query.
 * Exported so the resume-executions plugin can reconstruct options without
 * duplicating this logic.
 */
export function buildLiaseQueryOptions(
  savedLiaseQuery: dbSchema.LiaseQuery,
  liaseRequests: GenericRequest[],
): NonNullable<LiaseQueryOptions> {
  const options: NonNullable<LiaseQueryOptions> = {};
  if (savedLiaseQuery.fetchCountLimit !== null) {
    if (savedLiaseQuery.fetchCountLimitPerVariation) {
      // Limit applies independently to each variation request
      options.fetchCountLimit = savedLiaseQuery.fetchCountLimit;
    } else {
      // If we have a global limit make sure our per-request limit is high enough that a single query variation could
      // potentially make up the entire limit
      options.fetchCountLimit =
        savedLiaseQuery.fetchCountLimit * liaseRequests.length;
    }
    // else: limit applies across all variation requests combined — enforced
    // ourselves in the response loop via globalFetchLimit; no per-request cap.
  }
  return options;
}

/**
 * Loads the DB-stored secrets for a saved query and merges them into the
 * provided options object.  Exported so resume-executions can reuse the logic.
 */
export async function loadSecretsIntoOptions(
  savedLiaseQuery: dbSchema.LiaseQuery,
  options: NonNullable<LiaseQueryOptions>,
): Promise<void> {
  if (!savedLiaseQuery.secretMappings) return;
  const secrets: Record<string, string> = {};
  for (const [fieldName, secretId] of Object.entries(
    savedLiaseQuery.secretMappings,
  )) {
    const dbSecret = await db.query.querySecret.findFirst({
      where: (s, { eq }) => eq(s.id, secretId),
    });
    if (dbSecret) {
      secrets[fieldName] = decryptValue(dbSecret.encryptedValue);
    }
  }
  if (Object.keys(secrets).length > 0) {
    options.secrets = { ...options.secrets, ...secrets };
  }
}

export async function startLiaseQueryExecution(
  savedLiaseQuery: dbSchema.LiaseQuery,
): Promise<{
  execution: dbSchema.LiaseQueryExecution;
  executionPromise: Promise<void>;
}> {
  const execution = await createLiaseQueryExecution({ savedLiaseQuery });
  const liaseRequests = expandAllVariations(savedLiaseQuery);
  const liaseQueryOptions = buildLiaseQueryOptions(
    savedLiaseQuery,
    liaseRequests,
  );
  await loadSecretsIntoOptions(savedLiaseQuery, liaseQueryOptions);
  // Run the actual execution in the background without blocking the caller
  const executionPromise = runLiaseQueryExecution({
    liaseQueryExecution: execution,
    liaseRequests,
    liaseQueryOptions,
    savedLiaseQuery,
  });
  return { execution, executionPromise };
}

export async function runLiaseQueryExecution({
  liaseQueryExecution,
  liaseRequests,
  liaseQueryOptions = {},
  savedLiaseQuery,
}: {
  liaseQueryExecution: dbSchema.LiaseQueryExecution;
  liaseRequests: GenericRequest[];
  liaseQueryOptions?: LiaseQueryOptions;
  savedLiaseQuery?: dbSchema.LiaseQuery;
}): Promise<void> {
  const executionId = liaseQueryExecution.id;
  const queryId = savedLiaseQuery?.id ?? null;

  // --- Resume state ---
  const resumeStage = liaseQueryExecution.resumeStage as ResumeStage | null;
  const resumeVariationIndex = liaseQueryExecution.resumeVariationIndex;
  const resumePageNumber = liaseQueryExecution.resumePageNumber ?? null;
  const resumeCursor =
    (liaseQueryExecution.resumeCursor as string | number | null) ?? null;

  // When fetching, pageCount tracks total pages fetched. On resume, seed it from
  // the DB so the global fetch-count limit check stays accurate.
  let pageCount = liaseQueryExecution.resumePagesFetched;

  // When fetchCountLimitPerVariation is false the limit applies across all
  // variation requests combined (counted in pages); we track the running total here.
  const globalFetchLimit =
    savedLiaseQuery &&
    savedLiaseQuery.fetchCountLimit !== null &&
    !savedLiaseQuery.fetchCountLimitPerVariation
      ? savedLiaseQuery.fetchCountLimit
      : null;

  // Seed stats from the DB so that a resumed execution carries forward the progress
  // from the interrupted run. The schema defaults these to -1 ("not yet run"), so
  // Math.max(0, …) normalises both the "fresh execution" case and any hard-crash
  // where stats were never written before the process exited.
  let liaseMediaFound = Math.max(0, liaseQueryExecution.liaseMediaFound);
  let liaseMediaNew = Math.max(0, liaseQueryExecution.liaseMediaNew);
  let liaseMediaUpdated = Math.max(0, liaseQueryExecution.liaseMediaUpdated);
  let liaseMediaRemoved = Math.max(0, liaseQueryExecution.liaseMediaRemoved);
  const liaseMediaNotSuitable = -1; // not used at the moment
  let liaseMediaUnchanged = Math.max(
    0,
    liaseQueryExecution.liaseMediaUnchanged,
  );

  let cacheMediaCreated = Math.max(0, liaseQueryExecution.cacheMediaCreated);
  let cacheMediaUpdated = Math.max(0, liaseQueryExecution.cacheMediaUpdated);
  let cacheMediaUnchanged = Math.max(
    0,
    liaseQueryExecution.cacheMediaUnchanged,
  );
  let cacheMediaDeleted = Math.max(0, liaseQueryExecution.cacheMediaDeleted);

  let currentLiaseRequest: GenericRequest | null = null;
  let currentLiaseId: string | null = null;

  // ----- Stage: initialising -----
  // Only runs on a fresh (non-resumed) execution.
  if (savedLiaseQuery && !resumeStage) {
    await queryExecutionTaskSystem.updateTask(executionId, {
      stage: "initialising",
    });
    await db
      .update(dbSchema.liaseQueryMedia)
      .set({ foundInLatestExecution: false })
      .where(eq(dbSchema.liaseQueryMedia.queryId, savedLiaseQuery.id));

    // Persist stage transition so that if interrupted before any page is fetched
    // we still know initialising is done and can skip it on the next resume.
    await db
      .update(dbSchema.liaseQueryExecution)
      .set({ resumeStage: "fetching-liase-results", updatedAt: new Date() })
      .where(eq(dbSchema.liaseQueryExecution.id, executionId));
  }

  try {
    // ----- Stage: fetching-liase-results -----
    if (shouldRunStage("fetching-liase-results", resumeStage)) {
      // In-memory checkpoint updated after each committed page.
      // The signal handler flushes this to the DB so the next startup can resume
      // from the right page rather than re-fetching from the beginning.
      const checkpoint = {
        variationIndex: resumeVariationIndex,
        pageNumber: resumePageNumber,
        cursor: resumeCursor,
        variationPagesFetched: liaseQueryExecution.resumeVariationPagesFetched,
      };

      const saveCheckpoint = async () => {
        await db
          .update(dbSchema.liaseQueryExecution)
          .set({
            resumeStage: "fetching-liase-results",
            resumeVariationIndex: checkpoint.variationIndex,
            resumePageNumber: checkpoint.pageNumber,
            resumeCursor: checkpoint.cursor,
            resumePagesFetched: pageCount,
            resumeVariationPagesFetched: checkpoint.variationPagesFetched,
            liaseMediaFound,
            liaseMediaNew,
            liaseMediaUpdated,
            liaseMediaRemoved,
            liaseMediaUnchanged,
            cacheMediaCreated,
            cacheMediaUpdated,
            cacheMediaUnchanged,
            cacheMediaDeleted,
            updatedAt: new Date(),
          })
          .where(eq(dbSchema.liaseQueryExecution.id, executionId));
      };

      queryExecutionTaskSystem.registerCheckpointSaver(
        executionId,
        saveCheckpoint,
      );
      try {
        await queryExecutionTaskSystem.updateTask(executionId, {
          stage: "fetching-liase-results",
          pageCount,
        });

        for (let varIdx = 0; varIdx < liaseRequests.length; varIdx++) {
          // Skip variations already completed in a previous run.
          if (varIdx < resumeVariationIndex) continue;

          // varIdx is always in-bounds because the for-loop condition is varIdx < liaseRequests.length
          const liaseRequestBase = liaseRequests[varIdx];
          if (liaseRequestBase === undefined)
            throw new Error(`No liase request at variation index ${varIdx}`);
          let liaseRequest = liaseRequestBase;

          // For the variation that was in-progress when the server shut down,
          // apply the saved page/cursor offset so we don't re-fetch from page 1.
          const isResumedVariation =
            varIdx === resumeVariationIndex &&
            resumeStage === "fetching-liase-results";
          if (isResumedVariation && resumePageNumber !== null) {
            liaseRequest = { ...liaseRequest, pageNumber: resumePageNumber };
          } else if (isResumedVariation && resumeCursor !== null) {
            liaseRequest = { ...liaseRequest, cursor: resumeCursor };
          }

          currentLiaseRequest = liaseRequest;

          // Reduce the fetch limit for the resumed variation by the pages already
          // fetched in it so we don't exceed the original intent.
          const variationOptions = { ...liaseQueryOptions };
          const resumeVariationPagesFetched =
            liaseQueryExecution.resumeVariationPagesFetched;
          if (
            isResumedVariation &&
            resumeVariationPagesFetched > 0 &&
            variationOptions.fetchCountLimit !== undefined
          ) {
            variationOptions.fetchCountLimit = Math.max(
              1,
              variationOptions.fetchCountLimit - resumeVariationPagesFetched,
            );
          }

          const liaseQuery = await getLiaseQuery({
            request: liaseRequest,
            queryOptions: variationOptions,
          });

          // Per-variation page counter (reset for each new variation).
          let variationPagesFetched = isResumedVariation
            ? resumeVariationPagesFetched
            : 0;

          for await (const response of liaseQuery) {
            pageCount++;
            variationPagesFetched++;

            // Batch the whole page into one transaction: two multi-row inserts
            // instead of N individual transactions (N × 3 DB round-trips → 3).
            await db.transaction(async (dbTx) => {
              await batchUpsertLiaseQueryMediaPage({
                dbTx,
                liaseMediaList: response.media,
                liaseQueryExecution,
              });
            });
            liaseMediaFound += response.media.length;

            await queryExecutionTaskSystem.updateTask(executionId, {
              pageCount,
              liaseMediaFound,
            });

            // All media from this page committed – advance the in-memory checkpoint
            // so the signal handler can persist it with the correct next-page value.
            if (response.page) {
              if ("pageNumber" in response.page) {
                checkpoint.pageNumber = response.page.pageNumber + 1;
                checkpoint.cursor = null;
              } else if ("nextCursor" in response.page) {
                checkpoint.cursor = response.page.nextCursor;
                checkpoint.pageNumber = null;
              }
            }
            checkpoint.variationIndex = varIdx;
            checkpoint.variationPagesFetched = variationPagesFetched;

            if (globalFetchLimit !== null && pageCount >= globalFetchLimit) {
              break;
            }
          }

          // Variation completed – advance the checkpoint index and reset per-variation state.
          checkpoint.variationIndex = varIdx + 1;
          checkpoint.variationPagesFetched = 0;
          checkpoint.pageNumber = null;
          checkpoint.cursor = null;

          if (globalFetchLimit !== null && pageCount >= globalFetchLimit) {
            break;
          }
        }
      } finally {
        queryExecutionTaskSystem.unregisterCheckpointSaver(executionId);
      }

      // Fetching stage complete – persist stage transition so processing stages
      // can be resumed without re-fetching. Also persist liaseMediaFound so that
      // if the server restarts before processing completes the resumed run can
      // display the correct found-count without re-fetching.
      if (savedLiaseQuery) {
        await db
          .update(dbSchema.liaseQueryExecution)
          .set({
            resumeStage: "processing-added-or-updated",
            resumeVariationIndex: 0,
            resumePageNumber: null,
            resumeCursor: null,
            resumePagesFetched: 0,
            resumeVariationPagesFetched: 0,
            liaseMediaFound,
            updatedAt: new Date(),
          })
          .where(eq(dbSchema.liaseQueryExecution.id, executionId));
      }
    }

    // Anonymous queries don't have a saved liase query so aren't linked to any previous executions
    const previousExecution = savedLiaseQuery
      ? await getPreviousLiaseQueryExecution({
          queryId: savedLiaseQuery.id,
          currentExecutionId: executionId,
        })
      : null;

    // ----- Stage: processing-added-or-updated -----
    if (shouldRunStage("processing-added-or-updated", resumeStage)) {
      await queryExecutionTaskSystem.updateTask(executionId, {
        stage: "processing-added-or-updated",
      });

      // Do in batches to avoid loading results into memory at once.
      let liaseIdCursor = null;
      const batchSize = 100;
      while (true) {
        const previousOnlyLiaseMedia = alias(
          dbSchema.liaseQueryMedia,
          "previous_only_liase_media",
        );
        const foundLiaseMedia = await db
          .select({
            liaseId: dbSchema.liaseQueryMedia.liaseId,
            instancesInThisExecution: count(dbSchema.liaseQueryMedia.id),
            instancesOnlyInThisExecution:
              sql<number>`(count(*) filter (where ${dbSchema.liaseQueryMedia.queryExecutionIdCreatedOn} = ${executionId}))::int`.as(
                "instances_only_in_this_execution",
              ),
            instancesOnlyInLastExecution: count(previousOnlyLiaseMedia.id),
            lastId: max(dbSchema.liaseQueryMedia.id),
          })
          .from(dbSchema.liaseQueryMedia)
          .leftJoin(
            previousOnlyLiaseMedia,
            and(
              eq(
                previousOnlyLiaseMedia.liaseId,
                dbSchema.liaseQueryMedia.liaseId,
              ),
              eq(previousOnlyLiaseMedia.foundInLatestExecution, false),
              // Restrict to the same query so rows from other queries don't
              // contaminate instancesOnlyInLastExecution.
              savedLiaseQuery
                ? eq(previousOnlyLiaseMedia.queryId, savedLiaseQuery.id)
                : sql`false`,
            ),
          )
          .where(
            and(
              savedLiaseQuery
                ? eq(dbSchema.liaseQueryMedia.queryId, savedLiaseQuery.id)
                : eq(
                    dbSchema.liaseQueryMedia.queryExecutionIdCreatedOn,
                    executionId,
                  ),
              liaseIdCursor !== null
                ? gt(dbSchema.liaseQueryMedia.liaseId, liaseIdCursor)
                : undefined,
              eq(dbSchema.liaseQueryMedia.foundInLatestExecution, true),
            ),
          )
          .groupBy(dbSchema.liaseQueryMedia.liaseId)
          .orderBy(dbSchema.liaseQueryMedia.liaseId)
          .limit(batchSize);

        const lastInBatch = foundLiaseMedia.at(-1);
        if (!lastInBatch) break;
        liaseIdCursor = lastInBatch.liaseId;

        for (const liaseMedia of foundLiaseMedia) {
          currentLiaseId = liaseMedia.liaseId;

          let instancesOnlyInLastExecution =
            liaseMedia.instancesOnlyInLastExecution;
          let instancesOnlyInThisExecution =
            liaseMedia.instancesOnlyInThisExecution;
          const instancesInThisExecution = liaseMedia.instancesInThisExecution;
          let instancesInBothExecutions =
            instancesInThisExecution - instancesOnlyInThisExecution;
          let instancesInLastExecution =
            instancesInBothExecutions + instancesOnlyInLastExecution;

          // If the previous execution failed we can't trust that cache media was correctly added/updated so we treat
          // all media as changed.
          if (previousExecution?.status === "failed") {
            // Promote the "in both" instances to "only in this execution" so
            // everything goes through the create/update path below.
            instancesOnlyInThisExecution += instancesInBothExecutions;
            instancesInBothExecutions = 0;
            instancesInLastExecution = 0;
            instancesOnlyInLastExecution = 0;
          }

          const instancesUnchanged = instancesInBothExecutions;
          const instancesAdded = Math.max(
            0,
            instancesOnlyInThisExecution - instancesOnlyInLastExecution,
          );
          const instancesRemoved = Math.max(
            0,
            instancesOnlyInLastExecution - instancesOnlyInThisExecution,
          );
          const instancesChanged = Math.min(
            instancesOnlyInThisExecution,
            instancesOnlyInLastExecution,
          );

          liaseMediaUnchanged += instancesUnchanged;
          liaseMediaUpdated += instancesChanged;
          liaseMediaNew += instancesAdded;
          liaseMediaRemoved += instancesRemoved;

          if (instancesInLastExecution) {
            if (
              instancesOnlyInLastExecution === 0 &&
              instancesOnlyInThisExecution === 0
            ) {
              // unchanged
              cacheMediaUnchanged++;
            } else {
              // changed
              const { status } = await createOrUpdateCacheMedia({
                liaseId: liaseMedia.liaseId,
              });
              if (status === "updated") {
                // updated
                cacheMediaUpdated++;
              } else if (status === "created") {
                cacheMediaCreated++;
                await createExecutionLogEntry({
                  executionId,
                  queryId,
                  level: "warning",
                  message:
                    "Media found in previous execution so expected cache media to exist but it does not. Re-created it.",
                });
              } else {
                status satisfies never;
              }
            }
          } else {
            // not found in previous execution (or previous execution failed so we don't trust it)
            const { status } = await createOrUpdateCacheMedia({
              liaseId: liaseMedia.liaseId,
            });
            if (status === "created") {
              cacheMediaCreated++;
            } else if (status === "updated") {
              cacheMediaUpdated++;
            } else {
              status satisfies never;
            }
          }
          await queryExecutionTaskSystem.updateTask(executionId, {
            pageCount,
            liaseMediaFound,
            liaseMediaNew,
            liaseMediaUpdated,
            liaseMediaRemoved,
            liaseMediaUnchanged,
            cacheMediaCreated,
            cacheMediaUpdated,
            cacheMediaUnchanged,
          });
        }

        currentLiaseId = null;
      }

      if (savedLiaseQuery) {
        await db
          .update(dbSchema.liaseQueryExecution)
          .set({
            resumeStage: "processing-removed",
            liaseMediaNew,
            liaseMediaUpdated,
            liaseMediaUnchanged,
            liaseMediaRemoved,
            cacheMediaCreated,
            cacheMediaUpdated,
            cacheMediaUnchanged,
            updatedAt: new Date(),
          })
          .where(eq(dbSchema.liaseQueryExecution.id, executionId));
      }
    }

    // ----- Stage: processing-removed -----
    if (savedLiaseQuery && shouldRunStage("processing-removed", resumeStage)) {
      await queryExecutionTaskSystem.updateTask(executionId, {
        stage: "processing-removed",
      });

      const otherQueriesMedia = alias(
        dbSchema.liaseQueryMedia,
        "other_queries_media",
      );
      const removedMedias = await db
        .select({
          liaseId: dbSchema.liaseQueryMedia.liaseId,
          inOtherQueries: sql<boolean>`bool_or(${otherQueriesMedia.id} IS NOT NULL)`,
          count: count(dbSchema.liaseQueryMedia.id),
        })
        .from(dbSchema.liaseQueryMedia)
        .leftJoin(
          otherQueriesMedia,
          and(
            eq(otherQueriesMedia.liaseId, dbSchema.liaseQueryMedia.liaseId),
            eq(otherQueriesMedia.foundInLatestExecution, true),
          ),
        )
        .where(eq(dbSchema.liaseQueryMedia.queryId, savedLiaseQuery.id))
        .groupBy(dbSchema.liaseQueryMedia.liaseId)
        .having(
          sql`bool_or(${dbSchema.liaseQueryMedia.foundInLatestExecution}) = false`,
        );

      liaseMediaRemoved += removedMedias.reduce(
        (sum, media) => sum + media.count,
        0,
      );

      await queryExecutionTaskSystem.updateTask(executionId, {
        liaseMediaRemoved,
      });

      for (const removedMedia of removedMedias) {
        currentLiaseId = removedMedia.liaseId;
        if (!removedMedia.inOtherQueries) {
          // delete - no other instances
          const cacheMedia = await getCacheMedia({
            liaseId: removedMedia.liaseId,
            executionId, // Used for logging only
            queryId, // Used for logging only
          });
          if (cacheMedia) {
            cacheMediaDeleted++;
            await deleteCacheMediaEntry({
              cacheMedia,
              deletionReason: "all-sources-removed",
            });
          } else {
            await createExecutionLogEntry({
              executionId,
              queryId,
              level: "warning",
              message:
                "Media to be removed but no corresponding cache entry found",
            });
          }
        } else {
          // update - other instances
          const { status } = await createOrUpdateCacheMedia({
            liaseId: removedMedia.liaseId,
          });
          if (status === "updated") {
            cacheMediaUpdated++;
          } else if (status === "created") {
            cacheMediaCreated++;
            await createExecutionLogEntry({
              executionId,
              queryId,
              level: "warning",
              message:
                "Media found in other query execution so expected cache media to exist but it does not. Re-created it.",
            });
          } else {
            status satisfies never;
          }
        }

        await queryExecutionTaskSystem.updateTask(executionId, {
          cacheMediaDeleted,
          cacheMediaUpdated,
          cacheMediaCreated,
        });
      }

      currentLiaseId = null;

      await db
        .update(dbSchema.liaseQueryExecution)
        .set({
          resumeStage: "removing-previous-execution-results",
          liaseMediaRemoved,
          cacheMediaDeleted,
          cacheMediaUpdated,
          cacheMediaCreated,
          updatedAt: new Date(),
        })
        .where(eq(dbSchema.liaseQueryExecution.id, executionId));
    }

    // ----- Stage: removing-previous-execution-results -----
    if (
      savedLiaseQuery &&
      shouldRunStage("removing-previous-execution-results", resumeStage)
    ) {
      await queryExecutionTaskSystem.updateTask(executionId, {
        stage: "removing-previous-execution-results",
      });

      await deleteOldLiaseQueryMedia({
        queryId: savedLiaseQuery.id,
      });
    }

    // ----- Success -----
    const updatedTaskValues: Omit<
      typeof dbSchema.liaseQueryExecution.$inferInsert,
      "id"
    > = {
      updatedAt: new Date(),
      finishedAt: new Date(),
      status: "completed",
      pageCount,

      liaseMediaFound,
      liaseMediaNew,
      liaseMediaUpdated,
      liaseMediaRemoved,
      liaseMediaNotSuitable,
      liaseMediaUnchanged,

      cacheMediaCreated,
      cacheMediaUpdated,
      cacheMediaUnchanged,
      cacheMediaDeleted,
    };
    await db
      .update(dbSchema.liaseQueryExecution)
      .set(updatedTaskValues)
      .where(eq(dbSchema.liaseQueryExecution.id, executionId))
      .returning();

    await queryExecutionTaskSystem.updateTask(executionId, updatedTaskValues);

    // Run VACUUM ANALYZE in the background to reclaim dead tuples from the
    // inserts/updates/deletes above. Fire-and-forget so the caller sees
    // "completed" immediately.
    db.execute(sql`VACUUM ANALYZE cache_media`).catch((err) => {
      console.error("VACUUM ANALYZE cache_media failed:", err);
    });
  } catch (err) {
    const message = util.inspect(err, { depth: 4 });
    console.error(`Liase query execution ${executionId} failed:`, err);
    await createExecutionLogEntry({
      executionId,
      queryId,
      level: "fatal-error",
      message,
    });
    const task = await queryExecutionTaskSystem.getTask(executionId);
    await createExecutionLogEntry({
      executionId,
      queryId,
      level: "info",
      message: `Failed during stage "${task.stage}" while processing${currentLiaseId !== null ? ` media ${currentLiaseId} from` : ""} query: ${JSON.stringify(currentLiaseRequest, null, 2)}`,
    });
    const updatedTaskValues: Omit<
      typeof dbSchema.liaseQueryExecution.$inferInsert,
      "id"
    > = {
      updatedAt: new Date(),
      finishedAt: new Date(),
      status: "failed",
      pageCount,

      liaseMediaFound,
      liaseMediaNew,
      liaseMediaUpdated,
      liaseMediaRemoved,
      liaseMediaNotSuitable,
      liaseMediaUnchanged,

      cacheMediaCreated,
      cacheMediaUpdated,
      cacheMediaUnchanged,
      cacheMediaDeleted,
    };
    await db
      .update(dbSchema.liaseQueryExecution)
      .set(updatedTaskValues)
      .where(eq(dbSchema.liaseQueryExecution.id, executionId));

    await queryExecutionTaskSystem.updateTask(executionId, updatedTaskValues);
    throw err;
  }
}
