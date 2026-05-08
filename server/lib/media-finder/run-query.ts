import { deserialize } from "@@/server/lib/general";
import { queryExecutionTaskSystem } from "@@/server/lib/media-finder/execution-tasks";
import type { GenericMedia, GenericRequest } from "media-finder";
import { getSecrets } from "media-finder/dist/test/utils/general.js";
import { getMediaQuery } from "../media-finder";
import {
  createCacheMedia,
  createExecutionLogEntry,
  createFinderQueryExecution,
  createFinderQueryMedia,
  createFinderQueryMediaContent,
  createOrUpdateCacheMediaGroups,
  deleteCacheMediaEntry,
  deleteOldFinderQueryMedia,
  failFinderQueryExecution,
  finalizeFinderQueryExecution,
  getCacheMedia,
  getChangedPairs,
  getPreviousFinderQueryExecution,
  updateCacheMedia,
} from "./utils";

import { db } from "@@/server/utils/drizzle";
import type { dbSchema } from "@@/server/utils/drizzle";

type MediaFinderQueryOptions = Parameters<
  typeof getMediaQuery
>[0]["queryOptions"];

export async function startFinderQueryExecution(
  dbFinderQuery: dbSchema.FinderQuery,
): Promise<dbSchema.FinderQueryExecution> {
  const execution = await createFinderQueryExecution({ dbFinderQuery });
  const mediaFinderRequest = deserialize(
    dbFinderQuery.requestOptions,
  ) as GenericRequest;
  const mediaFinderQueryOptions: MediaFinderQueryOptions = {};
  if (dbFinderQuery.fetchCountLimit !== null) {
    mediaFinderQueryOptions.fetchCountLimit = dbFinderQuery.fetchCountLimit;
  }
  // Run the actual execution in the background without blocking the caller
  runMediaFinderQuery({
    mediaFinderRequest,
    mediaFinderQueryOptions,
    dbFinderQuery,
    existingExecution: execution,
  });
  return execution;
}

export async function runMediaFinderQuery({
  mediaFinderRequest,
  mediaFinderQueryOptions = {},
  dbFinderQuery,
  existingExecution,
}: {
  mediaFinderRequest: GenericRequest;
  mediaFinderQueryOptions?: MediaFinderQueryOptions;
  dbFinderQuery?: dbSchema.FinderQuery;
  existingExecution?: dbSchema.FinderQueryExecution;
}): Promise<void> {
  const finderQueryExecution =
    existingExecution ?? (await createFinderQueryExecution({ dbFinderQuery }));
  const executionId = finderQueryExecution.id;
  const queryId = dbFinderQuery?.id ?? null;

  try {
    mediaFinderQueryOptions.secrets = {
      ...mediaFinderQueryOptions.secrets,
      ...(await getSecrets(mediaFinderRequest)),
    };

    const mediaQuery = await getMediaQuery({
      request: mediaFinderRequest,
      queryOptions: mediaFinderQueryOptions,
    });

    // Phase 1: Download all results and record them in finder_query_media
    let mediaFoundCount = 0;
    let pageCount = 0;
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
        mediaFoundCount++;
      }
      queryExecutionTaskSystem.update(executionId, {
        pageCount,
        mediaFound: mediaFoundCount,
        status: "Fetching pages...",
      });
    }

    // Phase 2: Diff against previous run, then create/update/delete cache_media accordingly

    queryExecutionTaskSystem.update(executionId, {
      status: "Beginning processing...",
    });
    const previousExecution = dbFinderQuery
      ? await getPreviousFinderQueryExecution({
          queryId: dbFinderQuery.id,
          currentExecutionId: executionId,
        })
      : null;

    const { added, updated, removed } = await getChangedPairs({
      currentExecutionId: executionId,
      previousExecutionId: previousExecution?.id ?? null,
    });

    // Build a map of pairKey → contentHash for the current execution so Phase 2 only reads
    // the exact content that belongs to this run (not stale historical records).
    const currentContentHashByPair = new Map(
      [...added, ...updated].map((p) => [
        `${p.finderSourceId}:${p.finderMediaId}`,
        p.contentHash,
      ]),
    );

    async function fetchCurrentMedia(
      pairKey: string,
    ): Promise<GenericMedia | null> {
      const contentHash = currentContentHashByPair.get(pairKey);
      if (!contentHash) return null;
      const row = await db.query.finderQueryMediaContent.findFirst({
        where: (c, { eq }) => eq(c.contentHash, contentHash),
      });
      return row ? (deserialize(row.content) as GenericMedia) : null;
    }

    // Expand the set of changed pairs to include all source/media pairs that share a cache_media
    // with any of the changed pairs, so multi-source cache_media entries are fully rebuilt.
    const allChangedPairs = [...added, ...updated, ...removed];
    const affectedCacheMediaMap = new Map<
      number,
      { cacheMedia: dbSchema.CacheMedia; pairKeys: Set<string> }
    >();

    for (const pair of allChangedPairs) {
      const cacheMedia = await getCacheMedia({
        finderSourceId: pair.finderSourceId,
        finderMediaId: pair.finderMediaId,
      });
      if (cacheMedia) {
        const entry = affectedCacheMediaMap.get(cacheMedia.id) ?? {
          cacheMedia,
          pairKeys: new Set(),
        };
        for (const key of cacheMedia.finderSourceMediaIds) {
          if (key.includes("\t")) {
            const [src, mid] = key.split("\t");
            entry.pairKeys.add(`${src}:${mid}`);
          }
        }
        affectedCacheMediaMap.set(cacheMedia.id, entry);
      }
    }

    let mediaNewCount = 0;
    let mediaUpdatedCount = 0;
    let mediaRemovedCount = 0;
    const handledAddedPairKeys = new Set<string>();

    if (affectedCacheMediaMap.size) {
      queryExecutionTaskSystem.update(executionId, {
        status: "Updating existing media...",
      });
    }
    for (const { cacheMedia, pairKeys } of affectedCacheMediaMap.values()) {
      const pairsWithContent: GenericMedia[] = [];

      for (const pairKey of pairKeys) {
        const media = await fetchCurrentMedia(pairKey);
        if (media) pairsWithContent.push(media);
      }

      if (pairsWithContent.length === 0) {
        await db.transaction(async (dbTx) => {
          await deleteCacheMediaEntry({
            cacheMedia,
            deletionReason: "all_sources_removed",
            dbTx,
          });
        });
        mediaRemovedCount++;
      } else {
        await db.transaction(async (dbTx) => {
          await updateCacheMedia({
            existingCacheMedia: cacheMedia,
            allFinderMedias: pairsWithContent,
            dbTx,
          });
          await createOrUpdateCacheMediaGroups({
            finderMedias: pairsWithContent,
            cacheMedia,
            dbTx,
          });
        });
        mediaUpdatedCount++;
      }

      for (const pair of added) {
        if (pairKeys.has(`${pair.finderSourceId}:${pair.finderMediaId}`)) {
          handledAddedPairKeys.add(
            `${pair.finderSourceId}:${pair.finderMediaId}`,
          );
        }
      }
    }

    // Update task with processing progress
    if (mediaUpdatedCount > 0 || mediaRemovedCount > 0) {
      queryExecutionTaskSystem.update(executionId, {
        mediaUpdated: mediaUpdatedCount,
        mediaRemoved: mediaRemovedCount,
      });
    }

    if (added.length) {
      queryExecutionTaskSystem.update(executionId, {
        status: "Adding new media...",
      });
    }

    // Create cache_media for added pairs that had no existing cache_media
    for (const pair of added) {
      if (
        handledAddedPairKeys.has(`${pair.finderSourceId}:${pair.finderMediaId}`)
      )
        continue;

      const pairKey = `${pair.finderSourceId}:${pair.finderMediaId}`;
      const finderMedia = await fetchCurrentMedia(pairKey);
      if (!finderMedia) continue;

      await db.transaction(async (dbTx) => {
        const cacheMedia = await createCacheMedia({
          finderMedias: [finderMedia],
          dbTx,
        });
        await createOrUpdateCacheMediaGroups({
          finderMedias: [finderMedia],
          cacheMedia,
          dbTx,
        });
      });
      mediaNewCount++;
    }

    // Update task with new media count
    if (mediaNewCount > 0) {
      queryExecutionTaskSystem.update(executionId, { mediaNew: mediaNewCount });
    }

    // Clean up old finder_query_media records and update execution stats
    if (dbFinderQuery) {
      await deleteOldFinderQueryMedia({
        queryId: dbFinderQuery.id,
        currentExecutionId: executionId,
      });
    }

    await finalizeFinderQueryExecution({
      executionId,
      queryId,
      stats: {
        pageCount,
        mediaFound: mediaFoundCount,
        mediaNew: mediaNewCount,
        mediaUpdated: mediaUpdatedCount,
        mediaRemoved: mediaRemovedCount,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Finder query execution ${executionId} failed:`, err);
    await createExecutionLogEntry({
      executionId,
      queryId,
      level: "fatal_error",
      message,
    });
    await failFinderQueryExecution({ executionId, queryId, error: message });
  }
}
