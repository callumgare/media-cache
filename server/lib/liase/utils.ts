import type { GenericFile, GenericMedia } from "@liase/core";
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
import objectHash from "object-hash";

import { queryExecutionTaskSystem } from "@@/server/lib/liase/execution-tasks";
import { db, dbSchema } from "@@/server/utils/drizzle";
import { liaseFileToCacheFile } from "./shared";

type DbTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof dbSchema,
  ExtractTablesWithRelations<typeof dbSchema>
>;

export async function createLiaseQueryExecution({
  savedLiaseQuery,
}: {
  savedLiaseQuery?: dbSchema.LiaseQuery;
}) {
  const execution = await db
    .insert(dbSchema.liaseQueryExecution)
    .values({
      updatedAt: new Date(),
      startedAt: new Date(),
      queryId: savedLiaseQuery?.id ?? null,
      status: "running",
    })
    .returning()
    .then((result) => {
      const row = result[0];
      if (!row) throw new Error("Failed to create liase query execution");
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
}): Promise<dbSchema.LiaseQueryExecutionLog> {
  const [log] = await db
    .insert(dbSchema.liaseQueryExecutionLog)
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

export async function createOrUpdateLiaseQueryMedia({
  dbTx,
  liaseMedia,
  liaseQueryExecution,
}: {
  liaseMedia: GenericMedia;
  liaseQueryExecution: dbSchema.LiaseQueryExecution;
  dbTx: DbTransaction;
}) {
  const contentHash = objectHash(liaseMedia);
  return dbTx
    .insert(dbSchema.liaseQueryMedia)
    .values({
      updatedAt: new Date(),
      liaseId: getIdFromLiaseMedia(liaseMedia),
      foundInLatestExecution: true,
      queryExecutionIdCreatedOn: liaseQueryExecution.id,
      queryId: liaseQueryExecution.queryId,
      contentHash,
    })
    .onConflictDoUpdate({
      target: [
        dbSchema.liaseQueryMedia.contentHash,
        dbSchema.liaseQueryMedia.queryId,
      ],
      set: {
        updatedAt: new Date(),
        foundInLatestExecution: true,
      },
    })
    .returning()
    .then((result) => result[0]);
}

export async function ensureLiaseQueryMediaContentExists({
  dbTx,
  liaseMedia,
}: {
  liaseMedia: GenericMedia;
  dbTx: DbTransaction;
}) {
  const contentHash = objectHash(liaseMedia);
  return dbTx
    .insert(dbSchema.liaseQueryMediaContent)
    .values({
      liaseId: getIdFromLiaseMedia(liaseMedia),
      contentHash,
      content: liaseMedia,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: dbSchema.liaseQueryMediaContent.contentHash,
    })
    .returning()
    .then((result) => result[0]);
}

export async function getCacheMedia({
  liaseId,
  executionId,
  queryId,
}: {
  liaseId: string;
  executionId: number;
  queryId: number | null;
}): Promise<dbSchema.CacheMedia | null> {
  const results = await db
    .select()
    .from(dbSchema.cacheMedia)
    .where(sql`${dbSchema.cacheMedia.liaseIds} @> ARRAY[${liaseId}]::text[]`);
  if (results.length > 1) {
    await createExecutionLogEntry({
      executionId,
      queryId,
      level: "error",
      message: "Found multiple cache media entries with the same liase id",
    });
  }
  return results[0] ?? null;
}

export function mergeLiaseMedia({
  liaseMedias,
}: { liaseMedias: GenericMedia[] }): GenericMedia {
  function combineFilesOfSameType(files: GenericFile[]) {
    return files.reduce<GenericFile[]>((acc, file) => {
      const idx = acc.findIndex((f) => f.type === file.type);
      const existing = acc[idx];
      if (idx === -1 || existing === undefined) acc.push(file);
      else acc[idx] = deepmerge(existing, file);
      return acc;
    }, []);
  }

  return deepmerge.all<GenericMedia>(liaseMedias, {
    customMerge: (key) =>
      key === "files"
        ? (a: GenericFile[], b: GenericFile[]) =>
            combineFilesOfSameType([...a, ...b])
        : undefined,
  });
}

const existingSources = new Set<string>();
async function ensureSource(liaseSourceId: string, dbTx: DbTransaction) {
  if (existingSources.has(liaseSourceId)) {
    // Reduce db load by caching sources and assuming that sources aren't deleted
    return;
  }
  const source = await dbTx.query.source.findFirst({
    where: (s, { eq }) => eq(s.liaseSourceId, liaseSourceId),
  });
  if (!source) {
    await dbTx
      .insert(dbSchema.source)
      .values({ liaseSourceId, updatedAt: new Date() })
      .then((r) => r[0]);
  }
  existingSources.add(liaseSourceId);
}

function getIdFromLiaseMedia(liaseMedia: GenericMedia) {
  return `${liaseMedia.liaseSource}\t${liaseMedia.id}`;
}

function buildCacheMediaValues(
  liaseMediasWithDuplicates: GenericMedia[],
): typeof dbSchema.cacheMedia.$inferInsert {
  const now = new Date();

  // Since multiple queries of the same source might have the same media we merge
  // liaseMedias with the same liase id
  const liaseMedias = Object.values(
    Object.groupBy(liaseMediasWithDuplicates, getIdFromLiaseMedia),
  )
    .filter((group): group is GenericMedia[] => group !== undefined)
    .map((liaseMedias) => mergeLiaseMedia({ liaseMedias }));

  const files = liaseMedias.flatMap((fm) =>
    (fm.files || []).map((file) => ({
      createdAt: now,
      updatedAt: now,
      liaseSourceId: fm.liaseSource,
      liaseMediaId: String(fm.id),
      ...liaseFileToCacheFile(file),
    })),
  );

  const sources = liaseMedias.map((fm) => {
    const total = (fm.numberOfLikes ?? 0) + (fm.numberOfDislikes ?? 0);
    return {
      createdAt: now,
      updatedAt: now,
      uploadedAt: fm.dateUploaded ? new Date(fm.dateUploaded) : null,
      liaseSourceId: fm.liaseSource,
      liaseMediaId: String(fm.id),
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

  const uploadDates = liaseMedias
    .map((fm) => (fm.dateUploaded ? new Date(fm.dateUploaded) : null))
    .filter((d): d is Date => d !== null);

  const mainFile =
    files.find((f) => f.type === "full") ??
    files.find((f) => f.type === "main") ??
    files[0];

  return {
    title: liaseMedias.map((fm) => fm.title).find((t) => !!t) ?? null,
    description:
      liaseMedias.map((fm) => fm.description).find((d) => !!d) ?? null,
    earliestUploadedAt:
      uploadDates.length > 0
        ? new Date(Math.min(...uploadDates.map((d) => d.getTime())))
        : null,
    creators: [
      ...new Set(
        liaseMedias
          .map((fm) => fm.usernameOfCreator)
          .filter((c): c is string => !!c),
      ),
    ],
    uploaders: [
      ...new Set(
        liaseMedias
          .map((fm) => fm.usernameOfUploader ?? fm.nameOfUploader)
          .filter((u): u is string => !!u),
      ),
    ],
    views: liaseMedias.reduce<number | null>(
      (sum, fm) => (fm.views != null ? (sum ?? 0) + fm.views : sum),
      null,
    ),
    likes: liaseMedias.reduce<number | null>(
      (sum, fm) =>
        fm.numberOfLikes != null ? (sum ?? 0) + fm.numberOfLikes : sum,
      null,
    ),
    dislikes: liaseMedias.reduce<number | null>(
      (sum, fm) =>
        fm.numberOfDislikes != null ? (sum ?? 0) + fm.numberOfDislikes : sum,
      null,
    ),
    // liaseSourceIds stores plain source names for source-only GIN filtering
    liaseSourceIds: [...new Set(liaseMedias.map((fm) => fm.liaseSource))],
    // liaseIds stores only 'sourceId<TAB>mediaId' composites for exact lookups
    liaseIds: [
      ...new Set(
        liaseMedias.map((fm) => `${fm.liaseSource}\t${String(fm.id)}`),
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
  liaseId,
}: {
  liaseId: string;
}) {
  return await db.transaction(async (dbTx) => {
    let cacheMediaLiaseIds: string[];
    const [existingCacheMedia] = await dbTx
      .select()
      .from(dbSchema.cacheMedia)
      .where(sql`${dbSchema.cacheMedia.liaseIds} @> ARRAY[${liaseId}]::text[]`)
      .limit(1);
    if (existingCacheMedia) {
      // console.log("Found existing cache media with id", existingCacheMedia.id, "and liase ids", existingCacheMedia.liaseIds)
      cacheMediaLiaseIds = existingCacheMedia.liaseIds;
    } else {
      cacheMediaLiaseIds = [liaseId];
    }

    // Use DISTINCT ON to get the most recent content per (liaseId, queryId) pair,
    // since liaseQueryMediaContent stores all historical versions by contentHash.
    // Multiple saved queries may find the same media with different data, so we get
    // the latest from each query and let buildCacheMediaValues/mergeLiaseMedia merge them.
    const allLiaseMedia = await dbTx
      .selectDistinctOn(
        [dbSchema.liaseQueryMedia.liaseId, dbSchema.liaseQueryMedia.queryId],
        {
          content: dbSchema.liaseQueryMediaContent.content,
          updatedAt: dbSchema.liaseQueryMedia.updatedAt,
        },
      )
      .from(dbSchema.liaseQueryMedia)
      .innerJoin(
        dbSchema.liaseQueryMediaContent,
        eq(
          dbSchema.liaseQueryMedia.contentHash,
          dbSchema.liaseQueryMediaContent.contentHash,
        ),
      )
      .where(
        and(
          sql`${dbSchema.liaseQueryMedia.liaseId} = ANY(ARRAY[${cacheMediaLiaseIds}])`,
          eq(dbSchema.liaseQueryMedia.foundInLatestExecution, true),
        ),
      )
      .orderBy(
        // DISTINCT ON requires ORDER BY to start with the same columns.
        // desc(updatedAt) picks the most-recently-updated row within each
        // (liaseId, queryId) group.
        dbSchema.liaseQueryMedia.liaseId,
        dbSchema.liaseQueryMedia.queryId,
        desc(dbSchema.liaseQueryMedia.updatedAt),
      )
      .then((records) =>
        // Sort oldest→newest by updatedAt so that when groups are deep-merged
        // the most recently updated query's data wins (last write wins).
        records
          .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
          .map((r) => r.content),
      );

    const allSources = new Set(allLiaseMedia.map((media) => media.liaseSource));

    for (const source of allSources.values()) {
      await ensureSource(source, dbTx);
    }

    const cacheMediaValues = buildCacheMediaValues(allLiaseMedia);

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
      liaseMedias: allLiaseMedia,
      cacheMedia,
      dbTx,
    });

    return { status, cacheMedia };
  });
}

export async function createOrUpdateCacheMediaGroups({
  liaseMedias,
  cacheMedia,
  dbTx,
}: {
  liaseMedias: GenericMedia[];
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

  const allTags = [...new Set(liaseMedias.flatMap((fm) => fm.tags || []))];

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

export async function getPreviousLiaseQueryExecution({
  queryId,
  currentExecutionId,
}: {
  queryId: number;
  currentExecutionId: number;
}): Promise<dbSchema.LiaseQueryExecution | null> {
  return db.query.liaseQueryExecution
    .findFirst({
      where: (exec, { eq, ne, and }) =>
        and(eq(exec.queryId, queryId), ne(exec.id, currentExecutionId)),
      orderBy: (exec, { desc }) => [desc(exec.startedAt)],
    })
    .then((r) => r ?? null);
}

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

export async function deleteOldLiaseQueryMedia({
  queryId,
}: {
  queryId: number;
}): Promise<void> {
  await db
    .delete(dbSchema.liaseQueryMedia)
    .where(
      and(
        eq(dbSchema.liaseQueryMedia.queryId, queryId),
        eq(dbSchema.liaseQueryMedia.foundInLatestExecution, false),
      ),
    );
}
