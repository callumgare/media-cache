import deepmerge, { all } from "deepmerge";
import {
  type ExtractTablesWithRelations,
  and,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { GenericFile, GenericMedia } from "media-finder";
import objectHash from "object-hash";

import { queryExecutionTaskSystem } from "@@/server/lib/media-finder/execution-tasks";
import { db, dbSchema } from "@@/server/utils/drizzle";
import { finderFileToCacheFile } from "./shared";

type DbTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof dbSchema,
  ExtractTablesWithRelations<typeof dbSchema>
>;

export async function createFinderQueryExecution({
  savedFinderQuery,
}: {
  savedFinderQuery?: dbSchema.FinderQuery;
}) {
  const execution = await db
    .insert(dbSchema.finderQueryExecution)
    .values({
      updatedAt: new Date(),
      startedAt: new Date(),
      queryId: savedFinderQuery?.id ?? null,
      status: "running",
    })
    .returning()
    .then((result) => {
      const row = result[0];
      if (!row) throw new Error("Failed to create finder query execution");
      return row;
    });
  queryExecutionTaskSystem.createTask(execution);
  return execution;
}

export async function createExecutionLogEntry({
  executionId,
  queryId: _queryId,
  level,
  message,
  context,
}: {
  executionId: number;
  queryId: number | null;
  level: dbSchema.LogLevel;
  message: string;
  context?: Record<string, unknown>;
}): Promise<dbSchema.FinderQueryExecutionLog> {
  const [log] = await db
    .insert(dbSchema.finderQueryExecutionLog)
    .values({ executionId, level, message, context: context ?? null })
    .returning();
  if (!log) throw new Error("Failed to create execution log entry");

  queryExecutionTaskSystem.addLog(executionId, {
    id: log.id,
    level: log.level,
    message: log.message,
    createdAt: log.createdAt,
  });
  return log;
}

export async function createFinderQueryMedia({
  dbTx,
  finderMedia,
  finderQueryExecution,
}: {
  finderMedia: GenericMedia;
  finderQueryExecution: dbSchema.FinderQueryExecution;
  dbTx: DbTransaction;
}) {
  const contentHash = objectHash(finderMedia);
  return dbTx
    .insert(dbSchema.finderQueryMedia)
    .values({
      updatedAt: new Date(),
      finderId: getIdFromFinderMedia(finderMedia),
      queryExecutionId: finderQueryExecution.id,
      queryId: finderQueryExecution.queryId,
      contentHash,
    })
    .returning()
    .then((result) => result[0]);
}

export async function createFinderQueryMediaContent({
  dbTx,
  finderMedia,
}: {
  finderMedia: GenericMedia;
  dbTx: DbTransaction;
}) {
  const contentHash = objectHash(finderMedia);
  return dbTx
    .insert(dbSchema.finderQueryMediaContent)
    .values({
      finderId: getIdFromFinderMedia(finderMedia),
      contentHash,
      content: finderMedia,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: dbSchema.finderQueryMediaContent.contentHash,
    })
    .returning()
    .then((result) => result[0]);
}

export async function getCacheMedia({
  finderId,
  executionId,
  queryId,
}: {
  finderId: string;
  executionId: number;
  queryId: number | null;
}): Promise<dbSchema.CacheMedia | null> {
  const results = await db
    .select()
    .from(dbSchema.cacheMedia)
    .where(sql`${dbSchema.cacheMedia.finderIds} @> ARRAY[${finderId}]::text[]`);
  if (results.length > 1) {
    await createExecutionLogEntry({
      executionId,
      queryId,
      level: "error",
      message: "Found multiple cache media entries with the same finder id",
    });
  }
  return results[0] ?? null;
}

export function mergeFinderMedia({
  finderMedias,
}: { finderMedias: GenericMedia[] }): GenericMedia {
  function combineFilesOfSameType(files: GenericFile[]) {
    return files.reduce<GenericFile[]>((acc, file) => {
      const idx = acc.findIndex((f) => f.type === file.type);
      const existing = acc[idx];
      if (idx === -1 || existing === undefined) acc.push(file);
      else acc[idx] = deepmerge(existing, file);
      return acc;
    }, []);
  }

  return deepmerge.all<GenericMedia>(finderMedias, {
    customMerge: (key) =>
      key === "files"
        ? (a: GenericFile[], b: GenericFile[]) =>
            combineFilesOfSameType([...a, ...b])
        : undefined,
  });
}

const existingSources = new Set<string>();
async function ensureSource(finderSourceId: string, dbTx: DbTransaction) {
  if (existingSources.has(finderSourceId)) {
    // Reduce db load by caching sources and assuming that sources aren't deleted
    return;
  }
  const source = await dbTx.query.source.findFirst({
    where: (s, { eq }) => eq(s.finderSourceId, finderSourceId),
  });
  if (!source) {
    await dbTx
      .insert(dbSchema.source)
      .values({ finderSourceId, updatedAt: new Date() })
      .then((r) => r[0]);
  }
  existingSources.add(finderSourceId);
}

function getIdFromFinderMedia(finderMedia: GenericMedia) {
  return `${finderMedia.mediaFinderSource}\t${finderMedia.id}`;
}

function buildCacheMediaValues(
  finderMedias: GenericMedia[],
): typeof dbSchema.cacheMedia.$inferInsert {
  const now = new Date();

  // Since multiple queries of the same source might have the same media we merge
  // finderMedias with the same finder id
  const normalisedFinderMedias = Object.values(
    Object.groupBy(finderMedias, getIdFromFinderMedia),
  )
    .filter((group): group is GenericMedia[] => group !== undefined)
    .map((finderMedias) => mergeFinderMedia({ finderMedias }));

  const files = finderMedias.flatMap((fm) =>
    (fm.files || []).map((file) => ({
      createdAt: now,
      updatedAt: now,
      finderSourceId: fm.mediaFinderSource,
      finderMediaId: String(fm.id),
      ...finderFileToCacheFile(file),
    })),
  );

  const sources = finderMedias.map((fm) => {
    const total = (fm.numberOfLikes ?? 0) + (fm.numberOfDislikes ?? 0);
    return {
      createdAt: now,
      updatedAt: now,
      uploadedAt: fm.dateUploaded ? new Date(fm.dateUploaded) : null,
      finderSourceId: fm.mediaFinderSource,
      finderMediaId: String(fm.id),
      title: fm.title ?? null,
      description: fm.description ?? null,
      url: fm.url ?? null,
      creator: fm.usernameOfCreator ?? null,
      uploader: fm.usernameOfUploader ?? fm.nameOfUploader ?? null,
      views: fm.views ?? null,
      likes: fm.numberOfLikes ?? null,
      likesPercentage:
        total > 0 ? ((fm.numberOfLikes ?? 0) / total) * 100 : null,
      dislikes: fm.numberOfDislikes ?? null,
    };
  });

  const uploadDates = finderMedias
    .map((fm) => (fm.dateUploaded ? new Date(fm.dateUploaded) : null))
    .filter((d): d is Date => d !== null);

  const mainFile =
    files.find((f) => f.type === "full") ??
    files.find((f) => f.type === "main") ??
    files[0];

  return {
    title: finderMedias.map((fm) => fm.title).find((t) => !!t) ?? null,
    description:
      finderMedias.map((fm) => fm.description).find((d) => !!d) ?? null,
    earliestUploadedAt:
      uploadDates.length > 0
        ? new Date(Math.min(...uploadDates.map((d) => d.getTime())))
        : null,
    creators: [
      ...new Set(
        finderMedias
          .map((fm) => fm.usernameOfCreator)
          .filter((c): c is string => !!c),
      ),
    ],
    uploaders: [
      ...new Set(
        finderMedias
          .map((fm) => fm.usernameOfUploader ?? fm.nameOfUploader)
          .filter((u): u is string => !!u),
      ),
    ],
    views: finderMedias.reduce<number | null>(
      (sum, fm) => (fm.views != null ? (sum ?? 0) + fm.views : sum),
      null,
    ),
    likes: finderMedias.reduce<number | null>(
      (sum, fm) =>
        fm.numberOfLikes != null ? (sum ?? 0) + fm.numberOfLikes : sum,
      null,
    ),
    dislikes: finderMedias.reduce<number | null>(
      (sum, fm) =>
        fm.numberOfDislikes != null ? (sum ?? 0) + fm.numberOfDislikes : sum,
      null,
    ),
    // finderSourceIds stores plain source names for source-only GIN filtering
    finderSourceIds: [
      ...new Set(finderMedias.map((fm) => fm.mediaFinderSource)),
    ],
    // finderIds stores only 'sourceId<TAB>mediaId' composites for exact lookups
    finderIds: [
      ...new Set(
        finderMedias.map((fm) => `${fm.mediaFinderSource}\t${String(fm.id)}`),
      ),
    ],
    hasVideo: mainFile?.hasVideo ?? null,
    hasAudio: mainFile?.hasAudio ?? null,
    hasImage: mainFile?.hasImage ?? null,
    duration: mainFile?.duration ?? null,
    fileSize: mainFile?.fileSize ?? null,
    width: mainFile?.width ?? null,
    height: mainFile?.height ?? null,
    files,
    sources,
    updatedAt: now,
  };
}

export async function createOrUpdateCacheMedia({
  finderId,
}: {
  finderId: string;
}) {
  return await db.transaction(async (dbTx) => {
    let cacheMediaFinderIds: string[];
    const [existingCacheMedia] = await dbTx
      .select()
      .from(dbSchema.cacheMedia)
      .where(
        sql`${dbSchema.cacheMedia.finderIds} @> ARRAY[${finderId}]::text[]`,
      )
      .limit(1);
    if (existingCacheMedia) {
      // console.log("Found existing cache media with id", existingCacheMedia.id, "and finder ids", existingCacheMedia.finderIds)
      cacheMediaFinderIds = existingCacheMedia.finderIds;
    } else {
      cacheMediaFinderIds = [finderId];
    }

    // Use DISTINCT ON to get the most recent content per (finderId, queryId) pair,
    // since finderQueryMediaContent stores all historical versions by contentHash.
    // Multiple saved queries may find the same media with different data, so we get
    // the latest from each query and let buildCacheMediaValues/mergeFinderMedia merge them.
    const allFinderMedia = await dbTx
      .selectDistinctOn(
        [dbSchema.finderQueryMedia.finderId, dbSchema.finderQueryMedia.queryId],
        { content: dbSchema.finderQueryMediaContent.content },
      )
      .from(dbSchema.finderQueryMedia)
      .innerJoin(
        dbSchema.finderQueryMediaContent,
        eq(
          dbSchema.finderQueryMedia.contentHash,
          dbSchema.finderQueryMediaContent.contentHash,
        ),
      )
      .where(
        sql`${dbSchema.finderQueryMedia.finderId} = ANY(ARRAY[${cacheMediaFinderIds}])`,
      )
      .orderBy(
        dbSchema.finderQueryMedia.finderId,
        dbSchema.finderQueryMedia.queryId,
        desc(dbSchema.finderQueryMedia.id),
      )
      .then((records) => records.map((r) => r.content));

    const allSources = new Set(
      allFinderMedia.map((media) => media.mediaFinderSource),
    );

    for (const source of allSources.values()) {
      await ensureSource(source, dbTx);
    }

    const cacheMediaValues = buildCacheMediaValues(allFinderMedia);

    let status: "created" | "updated";
    let cacheMedia: dbSchema.CacheMedia | undefined;
    if (existingCacheMedia) {
      [cacheMedia] = await dbTx
        .update(dbSchema.cacheMedia)
        .set(cacheMediaValues)
        .where(eq(dbSchema.cacheMedia.id, existingCacheMedia.id))
        .returning();
      if (!cacheMedia) throw new Error("Failed to update cache media record");
      status = "updated";
    } else {
      [cacheMedia] = await dbTx
        .insert(dbSchema.cacheMedia)
        .values(cacheMediaValues)
        .returning();
      if (!cacheMedia) throw new Error("Failed to create cache media record");
      status = "created";
    }
    if (!cacheMedia) throw new Error("Unreachable: cacheMedia not set");

    // Update groups
    await createOrUpdateCacheMediaGroups({
      finderMedias: allFinderMedia,
      cacheMedia,
      dbTx,
    });

    return { status, cacheMedia };
  });
}

export async function createOrUpdateCacheMediaGroups({
  finderMedias,
  cacheMedia,
  dbTx,
}: {
  finderMedias: GenericMedia[];
  cacheMedia: dbSchema.CacheMedia;
  dbTx: DbTransaction;
}): Promise<void> {
  let rootTagsGroup = await dbTx.query.group.findFirst({
    where: (g) => and(eq(g.name, "tags"), isNull(g.parentId)),
  });
  if (!rootTagsGroup) {
    rootTagsGroup = await dbTx
      .insert(dbSchema.group)
      .values({ name: "tags", updatedAt: new Date() })
      .returning()
      .then((r) => r[0]);
    if (!rootTagsGroup) throw new Error("Failed to create root tags group");
  }

  const allTags = [...new Set(finderMedias.flatMap((fm) => fm.tags || []))];

  const groupIds: string[] = [];
  // parentMap stores id → parentId for groups we've touched, so we can compute paths without extra queries
  const parentMap = new Map<number, number | null>([
    [rootTagsGroup.id, rootTagsGroup.parentId],
  ]);

  for (const tag of allTags) {
    let group = await dbTx.query.group.findFirst({
      where: (g) => and(eq(g.name, tag), eq(g.parentId, rootTagsGroup.id)),
    });
    if (!group) {
      group = await dbTx
        .insert(dbSchema.group)
        .values({
          name: tag,
          parentId: rootTagsGroup.id,
          updatedAt: new Date(),
        })
        .returning()
        .then((r) => r[0]);
      if (!group) throw new Error(`Failed to create tag group: ${tag}`);
    }
    parentMap.set(group.id, group.parentId);
    groupIds.push(String(group.id));
  }

  // Build leaf→root paths using parentMap (e.g. '42\t15\t3\t')
  const groupPaths = groupIds.map((idStr) => {
    let path = "";
    let current: number | null = Number(idStr);
    while (current !== null) {
      path += `${current}\t`;
      current = parentMap.has(current)
        ? (parentMap.get(current) ?? null)
        : null;
    }
    return path;
  });

  await dbTx
    .update(dbSchema.cacheMedia)
    .set({
      groupIds,
      groupPaths,
      updatedAt: new Date(),
    })
    .where(eq(dbSchema.cacheMedia.id, cacheMedia.id));
}

export async function getPreviousFinderQueryExecution({
  queryId,
  currentExecutionId,
}: {
  queryId: number;
  currentExecutionId: number;
}): Promise<dbSchema.FinderQueryExecution | null> {
  return db.query.finderQueryExecution
    .findFirst({
      where: (exec, { eq, ne, and }) =>
        and(eq(exec.queryId, queryId), ne(exec.id, currentExecutionId)),
      orderBy: (exec, { desc }) => [desc(exec.startedAt)],
    })
    .then((r) => r ?? null);
}

// type SourceMediaPair = {
//   finderSourceId: string;
//   finderMediaId: string;
//   contentHash: string;
// };

// export async function getChangedPairs({
//   currentExecutionId,
//   previousExecutionId,
//   previousExecutionStatus,
// }: {
//   currentExecutionId: number;
//   previousExecutionId: number | null;
//   previousExecutionStatus: string | null;
// }): Promise<{
//   added: SourceMediaPair[];
//   updated: SourceMediaPair[];
//   removed: SourceMediaPair[];
//   unchanged: SourceMediaPair[];
// }> {
//   const currentPairs = await db
//     .select({
//       finderSourceId: dbSchema.finderQueryMedia.finderSourceId,
//       finderMediaId: dbSchema.finderQueryMedia.finderMediaId,
//       contentHash: dbSchema.finderQueryMedia.contentHash,
//     })
//     .from(dbSchema.finderQueryMedia)
//     .where(eq(dbSchema.finderQueryMedia.queryExecutionId, currentExecutionId));

//   if (!previousExecutionId) {
//     return { addedOrUpdated: currentPairs, removed: [], unchanged: [] };
//   }

//   const previousPairs = await db
//     .select({
//       finderSourceId: dbSchema.finderQueryMedia.finderSourceId,
//       finderMediaId: dbSchema.finderQueryMedia.finderMediaId,
//       contentHash: dbSchema.finderQueryMedia.contentHash,
//     })
//     .from(dbSchema.finderQueryMedia)
//     .where(eq(dbSchema.finderQueryMedia.queryExecutionId, previousExecutionId));

//   const currentMap = new Map(
//     currentPairs.map((p) => [`${p.finderSourceId}:${p.finderMediaId}`, p]),
//   );
//   const previousMap = new Map(
//     previousPairs.map((p) => [`${p.finderSourceId}:${p.finderMediaId}`, p]),
//   );

//   const addedOrUpdated: SourceMediaPair[] = [];
//   const unchanged: SourceMediaPair[] = [];
//   const removed: SourceMediaPair[] = [];

//   for (const [key, pair] of currentMap) {
//     const prev = previousMap.get(key);
//     if (
//       !prev ||
//       prev.contentHash !== pair.contentHash ||
//       previousExecutionStatus === "failed"
//     )
//       addedOrUpdated.push(pair);
//     else unchanged.push(pair);
//   }

//   for (const [key, pair] of previousMap) {
//     if (!currentMap.has(key)) removed.push(pair);
//   }

//   return { addedOrUpdated, removed, unchanged };
// }

export async function deleteCacheMediaEntry({
  cacheMedia,
  deletionReason,
  mergedIntoCacheMediaId,
}: {
  cacheMedia: dbSchema.CacheMedia;
  deletionReason: string;
  mergedIntoCacheMediaId?: number;
}): Promise<void> {
  return await db.transaction(async (dbTx) => {
    await dbTx.insert(dbSchema.deletedCacheMedia).values({
      updatedAt: new Date(),
      cacheMediaId: cacheMedia.id,
      deletionReason,
      mergedIntoCacheMediaId: mergedIntoCacheMediaId ?? null,
    });
    await dbTx
      .delete(dbSchema.cacheMedia)
      .where(eq(dbSchema.cacheMedia.id, cacheMedia.id));
  });
}

export async function deleteOldFinderQueryMedia({
  queryId,
  currentExecutionId,
}: {
  queryId: number;
  currentExecutionId: number;
}): Promise<void> {
  const oldExecutions = await db
    .select({ id: dbSchema.finderQueryExecution.id })
    .from(dbSchema.finderQueryExecution)
    .where(
      and(
        eq(dbSchema.finderQueryExecution.queryId, queryId),
        ne(dbSchema.finderQueryExecution.id, currentExecutionId),
      ),
    );

  if (oldExecutions.length === 0) return;

  await db.delete(dbSchema.finderQueryMedia).where(
    inArray(
      dbSchema.finderQueryMedia.queryExecutionId,
      oldExecutions.map((r) => r.id),
    ),
  );
}
