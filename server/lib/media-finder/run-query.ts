import util from "node:util";
import type { QueryVariation } from "@@/server/database/schema";
import { queryExecutionTaskSystem } from "@@/server/lib/media-finder/execution-tasks";
import type { GenericRequest } from "media-finder";
import { getSecrets } from "media-finder/dist/test/utils/general.js";
import { getMediaQuery } from "../media-finder";
import {
  createExecutionLogEntry,
  createFinderQueryExecution,
  createFinderQueryMedia,
  createFinderQueryMediaContent,
  createOrUpdateCacheMedia,
  deleteCacheMediaEntry,
  deleteOldFinderQueryMedia,
  getCacheMedia,
  getPreviousFinderQueryExecution,
} from "./utils";

import { db } from "@@/server/utils/drizzle";
import { dbSchema } from "@@/server/utils/drizzle";
import { and, eq, isNull, ne, not, notInArray, or } from "drizzle-orm";

type MediaFinderQueryOptions = Parameters<
  typeof getMediaQuery
>[0]["queryOptions"];

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
  savedFinderQuery: dbSchema.FinderQuery,
): GenericRequest[] {
  const base = savedFinderQuery.requestOptions;
  const variations = savedFinderQuery.queryVariations;
  if (!variations || variations.length === 0) return [base];

  const allRequests: GenericRequest[] = [];
  for (const variation of variations) {
    allRequests.push(...expandVariation(base, variation));
  }
  return allRequests;
}

export async function startFinderQueryExecution(
  savedFinderQuery: dbSchema.FinderQuery,
): Promise<{
  execution: dbSchema.FinderQueryExecution;
  executionPromise: Promise<void>;
}> {
  const execution = await createFinderQueryExecution({ savedFinderQuery });
  const mediaFinderRequests = expandAllVariations(savedFinderQuery);
  const mediaFinderQueryOptions: MediaFinderQueryOptions = {};
  if (savedFinderQuery.fetchCountLimit !== null) {
    if (savedFinderQuery.fetchCountLimitPerVariation) {
      // Limit applies independently to each variation request
      mediaFinderQueryOptions.fetchCountLimit =
        savedFinderQuery.fetchCountLimit;
    }
    // else: limit applies across all variation requests combined — enforced
    // ourselves in the response loop via globalFetchLimit; no per-request cap.
  }
  // Run the actual execution in the background without blocking the caller
  const executionPromise = runFinderQueryExecution({
    finderQueryExecution: execution,
    mediaFinderRequests,
    mediaFinderQueryOptions,
    savedFinderQuery,
  });
  executionPromise.catch((err) => {
    console.error(
      `Query execution ${execution.id} promise rejected unexpectedly:`,
      err,
    );
  });
  return { execution, executionPromise };
}

export async function runFinderQueryExecution({
  finderQueryExecution,
  mediaFinderRequests,
  mediaFinderQueryOptions = {},
  savedFinderQuery,
}: {
  finderQueryExecution: dbSchema.FinderQueryExecution;
  mediaFinderRequests: GenericRequest[];
  mediaFinderQueryOptions?: MediaFinderQueryOptions;
  savedFinderQuery?: dbSchema.FinderQuery;
}): Promise<void> {
  const executionId = finderQueryExecution.id;
  const queryId = savedFinderQuery?.id ?? null;

  let pageCount = 0;

  // When fetchCountLimitPerVariation is false the limit applies across all
  // variation requests combined (counted in pages); we track the running total here.
  const globalFetchLimit =
    savedFinderQuery &&
    savedFinderQuery.fetchCountLimit !== null &&
    !savedFinderQuery.fetchCountLimitPerVariation
      ? savedFinderQuery.fetchCountLimit
      : null;

  let finderMediaFound = 0;
  let finderMediaNew = 0;
  let finderMediaUpdated = 0;
  let finderMediaRemoved = 0;
  const finderMediaNotSuitable = -1; // not used at the moment
  let finderMediaUnchanged = 0;

  let cacheMediaCreated = 0;
  let cacheMediaUpdated = 0;
  let cacheMediaUnchanged = 0;
  let cacheMediaDeleted = 0;

  let currentFinderRequest: GenericRequest | null = null;

  try {
    // ----- Saving media finder results to execution media table -----
    await queryExecutionTaskSystem.updateTask(executionId, {
      stage: "fetching-media-finder-results",
      pageCount,
    });
    for (const mediaFinderRequest of mediaFinderRequests) {
      mediaFinderQueryOptions.secrets = {
        ...mediaFinderQueryOptions.secrets,
        ...(await getSecrets(mediaFinderRequest)),
      };

      currentFinderRequest = mediaFinderRequest;

      const mediaQuery = await getMediaQuery({
        request: mediaFinderRequest,
        queryOptions: mediaFinderQueryOptions,
      });

      for await (const response of mediaQuery) {
        pageCount++;
        for (const finderMedia of response.media) {
          await db.transaction(async (dbTx) => {
            await createFinderQueryMediaContent({ dbTx, finderMedia });
            await createFinderQueryMedia({
              dbTx,
              finderMedia,
              finderQueryExecution,
            });
          });
          finderMediaFound++;
        }
        await queryExecutionTaskSystem.updateTask(executionId, {
          pageCount,
          finderMediaFound,
        });
        if (globalFetchLimit !== null && pageCount >= globalFetchLimit) {
          break;
        }
      }
      if (globalFetchLimit !== null && pageCount >= globalFetchLimit) {
        break;
      }
    }

    // Anonymous queries don't have a saved finder query so aren't linked to any previous executions
    const previousExecution = savedFinderQuery
      ? await getPreviousFinderQueryExecution({
          queryId: savedFinderQuery.id,
          currentExecutionId: executionId,
        })
      : null;

    // ----- Adding or updating cache media for found finder media -----

    await queryExecutionTaskSystem.updateTask(executionId, {
      stage: "processing-added-or-updated",
    });

    // Do in batches to avoid loading results into memory at once.
    let lastId = 0;
    const batchSize = 100;
    while (true) {
      const foundFinderMedia = await db.query.finderQueryMedia.findMany({
        where: (media, { eq, and, gt }) =>
          and(gt(media.id, lastId), eq(media.queryExecutionId, executionId)),
        limit: batchSize,
        orderBy: (media, { asc }) => [asc(media.id)],
      });

      const lastInBatch = foundFinderMedia.at(-1);
      if (!lastInBatch) break;

      for (const finderMedia of foundFinderMedia) {
        // Check if found in previous saved query execution
        const foundFinderMediaFromPreviousExecution =
          previousExecution && previousExecution.status !== "failed"
            ? await db
                .select({
                  finderId: dbSchema.finderQueryMedia.finderId,
                  contentHash: dbSchema.finderQueryMedia.contentHash,
                })
                .from(dbSchema.finderQueryMedia)
                .where(
                  and(
                    eq(
                      dbSchema.finderQueryMedia.finderId,
                      finderMedia.finderId,
                    ),
                    eq(
                      dbSchema.finderQueryMedia.queryExecutionId,
                      previousExecution.id,
                    ),
                  ),
                )
            : [];

        if (foundFinderMediaFromPreviousExecution.length) {
          // found previous execution
          const contentHashMatches = foundFinderMediaFromPreviousExecution.some(
            (m) => m.contentHash === finderMedia.contentHash,
          );
          if (contentHashMatches) {
            // unchanged
            finderMediaUnchanged++;
            cacheMediaUnchanged++;
          } else {
            // changed
            finderMediaUpdated++;
            const { status } = await createOrUpdateCacheMedia({
              finderId: finderMedia.finderId,
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
          finderMediaNew++;
          const { status } = await createOrUpdateCacheMedia({
            finderId: finderMedia.finderId,
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

      await queryExecutionTaskSystem.updateTask(executionId, {
        pageCount,
        finderMediaFound,
        finderMediaNew,
        finderMediaUpdated,
        finderMediaUnchanged,
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
        .from(dbSchema.finderQueryMedia)
        .where(
          and(
            eq(
              dbSchema.finderQueryMedia.queryExecutionId,
              previousExecution.id,
            ),
            notInArray(
              dbSchema.finderQueryMedia.finderId,
              db
                .select({ finderId: dbSchema.finderQueryMedia.finderId })
                .from(dbSchema.finderQueryMedia)
                .where(
                  eq(dbSchema.finderQueryMedia.queryExecutionId, executionId),
                ),
            ),
          ),
        );

      finderMediaRemoved = removedMedias.length;

      await queryExecutionTaskSystem.updateTask(executionId, {
        finderMediaRemoved,
      });

      for (const removedMedia of removedMedias) {
        const otherExecutionMedia = await db
          .select({
            id: dbSchema.finderQueryMedia.id,
            queryExecutionId: dbSchema.finderQueryMedia.queryExecutionId,
          })
          .from(dbSchema.finderQueryMedia)
          .where(
            and(
              eq(dbSchema.finderQueryMedia.finderId, removedMedia.finderId),
              savedFinderQuery?.id
                ? or(
                    ne(dbSchema.finderQueryMedia.queryId, savedFinderQuery.id),
                    isNull(dbSchema.finderQueryMedia.queryId),
                  )
                : undefined,
              not(eq(dbSchema.finderQueryMedia.queryExecutionId, executionId)),
            ),
          );
        if (otherExecutionMedia.length === 0) {
          // delete - no other instances
          const cacheMedia = await getCacheMedia({
            finderId: removedMedia.finderId,
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
            finderId: removedMedia.finderId,
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

      await queryExecutionTaskSystem.updateTask(executionId, {
        cacheMediaDeleted,
        cacheMediaUpdated,
        cacheMediaCreated,
      });
    }

    // ----- Cleanup -----
    if (savedFinderQuery) {
      await queryExecutionTaskSystem.updateTask(executionId, {
        stage: "removing-previous-execution-results",
      });

      await deleteOldFinderQueryMedia({
        queryId: savedFinderQuery.id,
        currentExecutionId: executionId,
      });
    }

    // ----- Success -----
    const updatedTaskValues: Omit<
      typeof dbSchema.finderQueryExecution.$inferInsert,
      "id"
    > = {
      updatedAt: new Date(),
      finishedAt: new Date(),
      status: "completed",
      pageCount,

      finderMediaFound,
      finderMediaNew,
      finderMediaUpdated,
      finderMediaRemoved,
      finderMediaNotSuitable,
      finderMediaUnchanged,

      cacheMediaCreated,
      cacheMediaUpdated,
      cacheMediaUnchanged,
      cacheMediaDeleted,
    };
    await db
      .update(dbSchema.finderQueryExecution)
      .set(updatedTaskValues)
      .where(eq(dbSchema.finderQueryExecution.id, executionId))
      .returning();

    await queryExecutionTaskSystem.updateTask(executionId, updatedTaskValues);
  } catch (err) {
    const message = util.inspect(err, { depth: 4 });
    console.error(`Finder query execution ${executionId} failed:`, err);
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
      message: `Failed during stage "${task.stage}" while processing query: ${JSON.stringify(currentFinderRequest, null, 2)}`,
    });
    const updatedTaskValues: Omit<
      typeof dbSchema.finderQueryExecution.$inferInsert,
      "id"
    > = {
      updatedAt: new Date(),
      finishedAt: new Date(),
      status: "failed",
      pageCount,

      finderMediaFound,
      finderMediaNew,
      finderMediaUpdated,
      finderMediaRemoved,
      finderMediaNotSuitable,
      finderMediaUnchanged,

      cacheMediaCreated,
      cacheMediaUpdated,
      cacheMediaUnchanged,
      cacheMediaDeleted,
    };
    await db
      .update(dbSchema.finderQueryExecution)
      .set(updatedTaskValues)
      .where(eq(dbSchema.finderQueryExecution.id, executionId));

    await queryExecutionTaskSystem.updateTask(executionId, updatedTaskValues);
  }
}
