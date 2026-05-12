import util from "node:util";
import type { QueryVariation } from "@@/server/database/schema";
import { queryExecutionTaskSystem } from "@@/server/lib/liase/execution-tasks";
import type { GenericRequest } from "@liase/core";
import { getSecrets } from "@liase/core/dist/test/utils/general.js";
import { getLiaseQuery } from "../liase";
import {
  createExecutionLogEntry,
  createLiaseQueryExecution,
  createLiaseQueryMedia,
  createLiaseQueryMediaContent,
  createOrUpdateCacheMedia,
  deleteCacheMediaEntry,
  deleteOldLiaseQueryMedia,
  getCacheMedia,
  getPreviousLiaseQueryExecution,
} from "./utils";

import { db } from "@@/server/utils/drizzle";
import { dbSchema } from "@@/server/utils/drizzle";
import { and, eq, isNull, ne, not, notInArray, or } from "drizzle-orm";

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
  executionPromise.catch((err) => {
    console.error(
      `Query execution ${execution.id} promise rejected unexpectedly:`,
      err,
    );
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
            await createLiaseQueryMediaContent({ dbTx, liaseMedia });
            await createLiaseQueryMedia({
              dbTx,
              liaseMedia,
              liaseQueryExecution,
            });
          });
          liaseMediaFound++;
        }
        await queryExecutionTaskSystem.updateTask(executionId, {
          pageCount,
          liaseMediaFound,
        });
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
    let lastId = 0;
    const batchSize = 100;
    while (true) {
      const foundLiaseMedia = await db.query.liaseQueryMedia.findMany({
        where: (media, { eq, and, gt }) =>
          and(gt(media.id, lastId), eq(media.queryExecutionId, executionId)),
        limit: batchSize,
        orderBy: (media, { asc }) => [asc(media.id)],
      });

      const lastInBatch = foundLiaseMedia.at(-1);
      if (!lastInBatch) break;

      for (const liaseMedia of foundLiaseMedia) {
        currentLiaseId = liaseMedia.liaseId;
        // Check if found in previous saved query execution
        const foundLiaseMediaFromPreviousExecution =
          previousExecution && previousExecution.status !== "failed"
            ? await db
                .select({
                  liaseId: dbSchema.liaseQueryMedia.liaseId,
                  contentHash: dbSchema.liaseQueryMedia.contentHash,
                })
                .from(dbSchema.liaseQueryMedia)
                .where(
                  and(
                    eq(dbSchema.liaseQueryMedia.liaseId, liaseMedia.liaseId),
                    eq(
                      dbSchema.liaseQueryMedia.queryExecutionId,
                      previousExecution.id,
                    ),
                  ),
                )
            : [];

        if (foundLiaseMediaFromPreviousExecution.length) {
          // found previous execution
          const contentHashMatches = foundLiaseMediaFromPreviousExecution.some(
            (m) => m.contentHash === liaseMedia.contentHash,
          );
          if (contentHashMatches) {
            // unchanged
            liaseMediaUnchanged++;
            cacheMediaUnchanged++;
          } else {
            // changed
            liaseMediaUpdated++;
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
          liaseMediaNew++;
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
      }
      currentLiaseId = null;

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

      lastId = lastInBatch.id;
    }

    // ----- Removing media that was previously found but is no longer present -----

    if (previousExecution) {
      await queryExecutionTaskSystem.updateTask(executionId, {
        stage: "processing-removed",
      });

      const removedMedias = await db
        .select()
        .from(dbSchema.liaseQueryMedia)
        .where(
          and(
            eq(dbSchema.liaseQueryMedia.queryExecutionId, previousExecution.id),
            notInArray(
              dbSchema.liaseQueryMedia.liaseId,
              db
                .select({ liaseId: dbSchema.liaseQueryMedia.liaseId })
                .from(dbSchema.liaseQueryMedia)
                .where(
                  eq(dbSchema.liaseQueryMedia.queryExecutionId, executionId),
                ),
            ),
          ),
        );

      liaseMediaRemoved = removedMedias.length;

      await queryExecutionTaskSystem.updateTask(executionId, {
        liaseMediaRemoved,
      });

      for (const removedMedia of removedMedias) {
        currentLiaseId = removedMedia.liaseId;
        const otherExecutionMedia = await db
          .select({
            id: dbSchema.liaseQueryMedia.id,
            queryExecutionId: dbSchema.liaseQueryMedia.queryExecutionId,
          })
          .from(dbSchema.liaseQueryMedia)
          .where(
            and(
              eq(dbSchema.liaseQueryMedia.liaseId, removedMedia.liaseId),
              savedLiaseQuery?.id
                ? or(
                    ne(dbSchema.liaseQueryMedia.queryId, savedLiaseQuery.id),
                    isNull(dbSchema.liaseQueryMedia.queryId),
                  )
                : undefined,
              not(eq(dbSchema.liaseQueryMedia.queryExecutionId, executionId)),
            ),
          );
        if (otherExecutionMedia.length === 0) {
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
      }
      currentLiaseId = null;

      await queryExecutionTaskSystem.updateTask(executionId, {
        cacheMediaDeleted,
        cacheMediaUpdated,
        cacheMediaCreated,
      });
    }

    // ----- Cleanup -----
    if (savedLiaseQuery) {
      await queryExecutionTaskSystem.updateTask(executionId, {
        stage: "removing-previous-execution-results",
      });

      await deleteOldLiaseQueryMedia({
        queryId: savedLiaseQuery.id,
        currentExecutionId: executionId,
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
  }
}
