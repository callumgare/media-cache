import util from "node:util";
import type { QueryVariation } from "@@/server/database/schema";
import { queryExecutionTaskSystem } from "@@/server/lib/liase/execution-tasks";
import type { GenericRequest } from "@liase/core";
import { getSecrets } from "@liase/core/dist/test/utils/general.js";
import { getLiaseQuery } from "../liase";
import {
  createExecutionLogEntry,
  createLiaseQueryExecution,
  createOrUpdateCacheMedia,
  createOrUpdateLiaseQueryMedia,
  deleteCacheMediaEntry,
  deleteOldLiaseQueryMedia,
  ensureLiaseQueryMediaContentExists,
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

type LiaseQueryOptions = Parameters<typeof getLiaseQuery>[0]["queryOptions"];

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

function expandAllVariations(
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

export async function startLiaseQueryExecution(
  savedLiaseQuery: dbSchema.LiaseQuery,
): Promise<{
  execution: dbSchema.LiaseQueryExecution;
  executionPromise: Promise<void>;
}> {
  const execution = await createLiaseQueryExecution({ savedLiaseQuery });
  const liaseRequests = expandAllVariations(savedLiaseQuery);
  const liaseQueryOptions: LiaseQueryOptions = {};
  if (savedLiaseQuery.fetchCountLimit !== null) {
    if (savedLiaseQuery.fetchCountLimitPerVariation) {
      // Limit applies independently to each variation request
      liaseQueryOptions.fetchCountLimit = savedLiaseQuery.fetchCountLimit;
    } else {
      // If we have a global limit make sure our per-request limit is high enough that a single query variation could
      // potentially make up the entire limit
      liaseQueryOptions.fetchCountLimit =
        savedLiaseQuery.fetchCountLimit * liaseRequests.length;
    }
    // else: limit applies across all variation requests combined — enforced
    // ourselves in the response loop via globalFetchLimit; no per-request cap.
  }
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

  let pageCount = 0;

  // When fetchCountLimitPerVariation is false the limit applies across all
  // variation requests combined (counted in pages); we track the running total here.
  const globalFetchLimit =
    savedLiaseQuery &&
    savedLiaseQuery.fetchCountLimit !== null &&
    !savedLiaseQuery.fetchCountLimitPerVariation
      ? savedLiaseQuery.fetchCountLimit
      : null;

  let liaseMediaFound = 0;
  let liaseMediaNew = 0;
  let liaseMediaUpdated = 0;
  let liaseMediaRemoved = 0;
  const liaseMediaNotSuitable = -1; // not used at the moment
  let liaseMediaUnchanged = 0;

  let cacheMediaCreated = 0;
  let cacheMediaUpdated = 0;
  let cacheMediaUnchanged = 0;
  let cacheMediaDeleted = 0;

  let currentLiaseRequest: GenericRequest | null = null;
  let currentLiaseId: string | null = null;

  if (savedLiaseQuery) {
    await queryExecutionTaskSystem.updateTask(executionId, {
      stage: "initialising",
    });
    await db
      .update(dbSchema.liaseQueryMedia)
      .set({ foundInLatestExecution: false })
      .where(eq(dbSchema.liaseQueryMedia.queryId, savedLiaseQuery.id));
  }

  try {
    // ----- Saving liase results to execution media table -----
    await queryExecutionTaskSystem.updateTask(executionId, {
      stage: "fetching-liase-results",
      pageCount,
    });
    for (const liaseRequest of liaseRequests) {
      liaseQueryOptions.secrets = {
        ...liaseQueryOptions.secrets,
        ...(await getSecrets(liaseRequest)),
      };

      currentLiaseRequest = liaseRequest;

      const liaseQuery = await getLiaseQuery({
        request: liaseRequest,
        queryOptions: liaseQueryOptions,
      });

      for await (const response of liaseQuery) {
        pageCount++;
        for (const liaseMedia of response.media) {
          await db.transaction(async (dbTx) => {
            await ensureLiaseQueryMediaContentExists({ dbTx, liaseMedia });
            await createOrUpdateLiaseQueryMedia({
              dbTx,
              liaseMedia,
              liaseQueryExecution,
            });
          });
          liaseMediaFound++;

          await queryExecutionTaskSystem.updateTask(executionId, {
            pageCount,
            liaseMediaFound,
          });
        }
        if (globalFetchLimit !== null && pageCount >= globalFetchLimit) {
          break;
        }
      }
      if (globalFetchLimit !== null && pageCount >= globalFetchLimit) {
        break;
      }
    }

    // Anonymous queries don't have a saved liase query so aren't linked to any previous executions
    const previousExecution = savedLiaseQuery
      ? await getPreviousLiaseQueryExecution({
          queryId: savedLiaseQuery.id,
          currentExecutionId: executionId,
        })
      : null;

    // ----- Adding or updating cache media for found liase media -----

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
        let instancesInThisExecution = liaseMedia.instancesInThisExecution;
        let instancesInBothExecutions =
          instancesInThisExecution - instancesOnlyInThisExecution;
        let instancesInLastExecution =
          instancesInBothExecutions + instancesOnlyInLastExecution;

        // If the previous execution failed we can't trust that cache media was correctly added/updated so we treat
        // all media as changed.
        if (previousExecution?.status === "failed") {
          instancesOnlyInThisExecution +=
            instancesInBothExecutions + instancesInLastExecution;
          instancesInThisExecution +=
            instancesInBothExecutions + instancesInLastExecution;
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
          liaseMediaUnchanged,
          cacheMediaCreated,
          cacheMediaUpdated,
          cacheMediaUnchanged,
        });
      }

      currentLiaseId = null;
    }

    // ----- Removing media that was previously found but is no longer present -----

    if (savedLiaseQuery) {
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
    }

    // ----- Cleanup -----
    if (savedLiaseQuery) {
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
