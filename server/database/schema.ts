import type { QueryConditionFlatNode } from "@@/types/query-condition";
import type { WidgetId } from "@@/types/query-field-type-definitions";
import type { SortConfig } from "@@/types/sort-config";
import { explain } from "@drizzle-lab/api/extensions";
import type { GenericFile, GenericMedia, GenericRequest } from "@liase/core";
import { relations, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import superjson from "superjson";

const liaseRequest = customType<{
  data: GenericRequest;
  driverData: string;
}>({
  dataType() {
    return "text";
  },
  toDriver(value: GenericRequest): string {
    return superjson.stringify(value);
  },
  fromDriver(value: string): GenericRequest {
    return superjson.parse<GenericRequest>(value);
  },
});

const liaseMedia = customType<{
  data: GenericMedia;
  driverData: string;
}>({
  dataType() {
    return "text";
  },
  toDriver(value: GenericMedia): string {
    return superjson.stringify(value);
  },
  fromDriver(value: string): GenericMedia {
    return superjson.parse<GenericMedia>(value);
  },
});

const statusEnum = pgEnum("status", ["running", "completed", "failed"]);
export type Status = (typeof statusEnum)["enumValues"][number];

const videoFitEnum = pgEnum("video_fit", ["contain", "cover", "natural"]);
export type VideoFit = (typeof videoFitEnum)["enumValues"][number];

const videoStartPositionEnum = pgEnum("video_start_position", [
  "start",
  "random",
]);
export type VideoStartPosition =
  (typeof videoStartPositionEnum)["enumValues"][number];

const logLevelEnum = pgEnum("log_level", [
  "debug",
  "info",
  "warning",
  "error",
  "fatal-error",
]);
export type LogLevel = (typeof logLevelEnum)["enumValues"][number];

/*
user

A user of the Media Cache app
*/
export const user = pgTable("user", {
  id: serial("id").notNull().primaryKey(),
  createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { precision: 3 }).notNull(),
  username: text("username").notNull(),
});

export type User = typeof user.$inferSelect;

/*
userPreferences

Persistent user preferences for Media Cache
*/
export const userPreferences = pgTable("user_preferences", {
  id: serial("id").notNull().primaryKey(),
  createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { precision: 3 }).notNull(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => user.id),
  loopVideo: boolean("loop_video").notNull().default(false),
  muteVideo: boolean("mute_video").notNull().default(true),
  videoFit: videoFitEnum("video_fit").notNull().default("cover"),
  videoStartPosition: videoStartPositionEnum("video_start_position")
    .notNull()
    .default("start"),
});

export const userRelations = relations(user, ({ one }) => ({
  preferences: one(userPreferences, {
    fields: [user.id],
    references: [userPreferences.userId],
  }),
}));

export const userPreferencesRelations = relations(
  userPreferences,
  ({ one }) => ({
    user: one(user, {
      fields: [userPreferences.userId],
      references: [user.id],
    }),
  }),
);

export type UserPreferences = typeof userPreferences.$inferSelect;

/*
source

Information about Liase source
*/
export const source = pgTable("source", {
  id: serial("id").notNull().primaryKey(),
  createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { precision: 3 }).notNull(),
  liaseSourceId: text("liase_source_id").notNull().unique(),
});

export type Source = typeof source.$inferSelect;

/*
cacheMedia

A cached piece of media in Media Cache
*/
export const cacheMedia = pgTable(
  "cache_media",
  {
    id: serial("id").notNull().primaryKey(),
    firstIndexedAt: timestamp("first_indexed_at", { precision: 3 })
      .notNull()
      .defaultNow(),
    lastIndexedAt: timestamp("last_indexed_at", { precision: 3 }).notNull(),
    title: text("title"),
    description: text("description"),
    earliestUploadedAt: timestamp("earliest_uploaded_at", { precision: 3 }),
    earliestCreatedAt: timestamp("earliest_created_at", { precision: 3 }),
    latestUpdatedAt: timestamp("latest_updated_at", { precision: 3 }),
    creators: text("creators").array().notNull().default(sql`ARRAY[]::text[]`),
    uploaders: text("uploaders")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    views: integer("views"),
    likes: integer("likes"),
    dislikes: integer("dislikes"),
    // GIN-indexed array of plain source names (e.g. 'chan-browser') for source-only filters.
    liaseSourceIds: text("liase_source_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    // GIN-indexed array of 'sourceId<TAB>mediaId' composites for exact source+media lookups.
    liaseIds: text("liase_ids").array().notNull().default(sql`ARRAY[]::text[]`),
    // GIN-indexed array of group IDs (integers) the media belongs to,
    // populated from liase results.
    groupIds: integer("group_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::integer[]`),
    // GIN-indexed array of group IDs for manually-assigned groups.
    originalGroupIds: integer("original_group_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::integer[]`),
    // GIN-indexed array of tab-separated group hierarchy paths (leaf<TAB>parent<TAB>...<TAB>root<TAB>)
    // for each group in groupIds. Enables ancestor-aware filtering.
    groupPaths: text("group_paths")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    // Same as groupPaths but for originalGroupIds.
    originalGroupPaths: text("original_group_paths")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    hasVideo: boolean("has_video"),
    hasAudio: boolean("has_audio"),
    hasImage: boolean("has_image"),
    duration: doublePrecision("duration"),
    fileSize: integer("file_size"),
    width: integer("width"),
    height: integer("height"),
    aspectRatio: doublePrecision("aspect_ratio"),
    files:
      jsonb("files").$type<
        {
          createdAt: Date;
          updatedAt: Date;
          liaseSourceId: string;
          liaseMediaId: string;
          type: string;
          url: string;
          ext: string | null;
          mimeType: string | null;
          hasVideo: boolean | null;
          hasAudio: boolean | null;
          hasImage: boolean | null;
          duration: number | null;
          fileSize: number | null;
          width: number | null;
          height: number | null;
          urlExpires: Date | null;
          urlRefreshDetails: NonNullable<
            GenericFile["urlRefreshDetails"]
          > | null;
          urlUpdatedAt: Date;
        }[]
      >(),
    sources:
      jsonb("sources").$type<
        {
          liaseSourceId: string;
          liaseMediaId: string;
          createdAt: Date;
          updatedAt: Date;
          uploadedAt: Date | null;
          title: string | null;
          description: string | null;
          url: string | null;
          creator: string | null;
          uploader: string | null;
          views: number | null;
          likes: number | null;
          likesPercentage: number | null;
          dislikes: number | null;
        }[]
      >(),
  },
  (cacheMedia) => ({
    hasVideoIndex: index("cache_media__has_video_idx").on(cacheMedia.hasVideo),
    hasImageIndex: index("cache_media__has_image_idx").on(cacheMedia.hasImage),
    hasAudioIndex: index("cache_media__has_audio_idx").on(cacheMedia.hasAudio),
    durationIndex: index("cache_media__duration_idx").on(cacheMedia.duration),
    liaseSourceIdsGinIndex: index(
      "cache_media__liase_source_ids_gin_idx",
    ).using("gin", cacheMedia.liaseSourceIds),
    liaseIdsGinIndex: index("cache_media__liase_ids_gin_idx").using(
      "gin",
      cacheMedia.liaseIds,
    ),
    groupIdsGinIndex: index("cache_media__group_ids_gin_idx").using(
      "gin",
      cacheMedia.groupIds,
    ),
    originalGroupIdsGinIndex: index(
      "cache_media__original_group_ids_gin_idx",
    ).using("gin", cacheMedia.originalGroupIds),
    groupPathsGinIndex: index("cache_media__group_paths_gin_idx").using(
      "gin",
      cacheMedia.groupPaths,
    ),
    originalGroupPathsGinIndex: index(
      "cache_media__original_group_paths_gin_idx",
    ).using("gin", cacheMedia.originalGroupPaths),
    fileSizeIndex: index("cache_media__file_size_idx").on(cacheMedia.fileSize),
    heightIndex: index("cache_media__height_idx").on(cacheMedia.height),
    widthIndex: index("cache_media__width_idx").on(cacheMedia.width),
    aspectRatioIndex: index("cache_media__aspect_ratio_idx").on(
      cacheMedia.aspectRatio,
    ),
    firstIndexedAtIndex: index("cache_media__first_indexed_at_idx").on(
      cacheMedia.firstIndexedAt,
    ),
    lastIndexedAtIndex: index("cache_media__last_indexed_at_idx").on(
      cacheMedia.lastIndexedAt,
    ),
    earliestCreatedAtIndex: index("cache_media__earliest_created_at_idx").on(
      cacheMedia.earliestCreatedAt,
    ),
    earliestUploadedAtIndex: index("cache_media__earliest_uploaded_at_idx").on(
      cacheMedia.earliestUploadedAt,
    ),
    latestUpdatedAtIndex: index("cache_media__latest_updated_at_idx").on(
      cacheMedia.latestUpdatedAt,
    ),
    titleIndex: index("cache_media__title_idx").on(cacheMedia.title),
  }),
);

export type CacheMedia = typeof cacheMedia.$inferSelect;

/*
deletedCacheMedia

A record of cacheMedia that have been deleted. If deleted as the contents was merged into other media then
it also tracks the id of the cacheMedia it was merged into so that any references to it can be redirected.
*/
export const deletedCacheMedia = pgTable("deleted_cache_media", {
  id: serial("id").notNull().primaryKey(),
  createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { precision: 3 }).notNull(),
  cacheMediaId: integer("cache_media_id").notNull().unique(),
  deletionReason: text("deletion_reason").notNull(),
  mergedIntoCacheMediaId: integer("merged_into_cache_media_id").references(
    () => cacheMedia.id,
  ),
});

export const deletedCacheMediaRelations = relations(
  deletedCacheMedia,
  ({ one }) => ({
    mergedIntoCacheMedia: one(cacheMedia, {
      fields: [deletedCacheMedia.mergedIntoCacheMediaId],
      references: [cacheMedia.id],
    }),
  }),
);

export type DeletedCacheMedia = typeof deletedCacheMedia.$inferSelect;

/*
group

A group which a cacheMedia can belong to.
*/
export const group = pgTable(
  "group",
  {
    id: serial("id").notNull().primaryKey(),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3 }).notNull(),
    parentId: integer("parent_id").references((): AnyPgColumn => group.id),
    name: text("name").notNull(),
  },
  (group) => ({
    childGroupNamesUniqueIdx: uniqueIndex("child_group_names_unique_idx").on(
      group.parentId,
      group.name,
    ),
  }),
);

export const groupRelations = relations(group, ({ one, many }) => ({
  parent: one(group, {
    relationName: "parent-child",
    fields: [group.parentId],
    references: [group.id],
  }),
  children: many(group, {
    relationName: "parent-child",
  }),
}));

export type Group = typeof group.$inferSelect;

/*
querySecret

A single saved secret value for a specific Liase source + secret field.
Multiple entries can exist for the same source/field (e.g. different accounts).
The encrypted value is stored with AES-256-GCM.
*/
export const querySecret = pgTable("query_secret", {
  id: serial("id").notNull().primaryKey(),
  createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { precision: 3 }).notNull(),
  label: text("label").notNull(),
  liaseSourceId: text("liase_source_id").notNull(),
  secretFieldName: text("secret_field_name").notNull(),
  secretFieldType: text("secret_field_type").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
});

export type QuerySecret = typeof querySecret.$inferSelect;

/*
savedSearch

A per-user saved media search, capturing filter conditions, sort order,
and per-field widget display preferences.
*/
export const savedSearch = pgTable(
  "saved_search",
  {
    id: serial("id").notNull().primaryKey(),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3 }).notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    conditionNodes: jsonb("condition_nodes")
      .$type<QueryConditionFlatNode[]>()
      .notNull(),
    sort: jsonb("sort").$type<SortConfig>().notNull(),
    widgetOverrides: jsonb("widget_overrides")
      .$type<Record<number, WidgetId>>()
      .notNull()
      .default({}),
  },
  (t) => [
    uniqueIndex("saved_search__user_id_name_unique_idx").on(t.userId, t.name),
  ],
);

export const savedSearchRelations = relations(savedSearch, ({ one }) => ({
  user: one(user, {
    fields: [savedSearch.userId],
    references: [user.id],
  }),
}));

export type SavedSearch = typeof savedSearch.$inferSelect;

/*
liaseQuery

The details for a query to be executed with Liase
*/
export type QueryVariation = {
  id: string;
  fieldOverrides: Record<string, unknown[]>;
};

export const liaseQuery = pgTable("liase_query", {
  id: serial("id").notNull().primaryKey(),
  createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { precision: 3 }).notNull(),
  title: text("title").notNull(),
  requestOptions: liaseRequest("request_options").notNull(),
  fetchCountLimit: integer("fetch_count_limit"),
  fetchCountLimitPerVariation: boolean("fetch_count_limit_per_variation")
    .notNull()
    .default(false),
  schedule: integer("schedule").notNull(),
  queryVariations: jsonb("query_variations").$type<QueryVariation[]>(),
  secretMappings: jsonb("secret_mappings").$type<Record<string, number>>(),
});

export const liaseQueryRelations = relations(liaseQuery, ({ many }) => ({
  liaseQueryExecutions: many(liaseQueryExecution),
}));

export type LiaseQuery = typeof liaseQuery.$inferSelect;

/*
liaseQueryExecution

A liaseQueryExecution is created every time a liase query is executed with details about how that
execution went/is going.
*/
export const liaseQueryExecution = pgTable("liase_query_execution", {
  id: serial("id").notNull().primaryKey(),
  updatedAt: timestamp("updated_at", { precision: 3 }).notNull(),

  startedAt: timestamp("started_at", { precision: 3 }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { precision: 3 }),
  queryId: integer("query_id").references(() => liaseQuery.id),
  status: statusEnum().notNull(),
  pageCount: integer("page_count").notNull().default(-1),

  liaseMediaFound: integer("media_found").notNull().default(-1),
  liaseMediaNew: integer("media_new").notNull().default(-1),
  liaseMediaUpdated: integer("media_updated").notNull().default(-1),
  liaseMediaRemoved: integer("media_removed").notNull().default(-1),
  liaseMediaNotSuitable: integer("media_not_suitable").notNull().default(-1),
  liaseMediaUnchanged: integer("media_unchanged").notNull().default(-1),

  cacheMediaCreated: integer("cache_media_created").notNull().default(-1),
  cacheMediaUpdated: integer("cache_media_updated").notNull().default(-1),
  cacheMediaUnchanged: integer("cache_media_unchanged").notNull().default(-1),
  cacheMediaDeleted: integer("cache_media_deleted").notNull().default(-1),

  // Checkpoint fields written at stage transitions and flushed by signal handlers so
  // a running execution can be resumed after an unexpected server restart.
  resumeStage: text("resume_stage"),
  resumeVariationIndex: integer("resume_variation_index").notNull().default(0),
  resumePageNumber: integer("resume_page_number"),
  resumeCursor: jsonb("resume_cursor"),
  resumePagesFetched: integer("resume_pages_fetched").notNull().default(0),
  resumeVariationPagesFetched: integer("resume_variation_pages_fetched")
    .notNull()
    .default(0),
});

export const liaseQueryExecutionRelations = relations(
  liaseQueryExecution,
  ({ one, many }) => ({
    query: one(liaseQuery, {
      fields: [liaseQueryExecution.queryId],
      references: [liaseQuery.id],
    }),
    logs: many(liaseQueryExecutionLog),
  }),
);

export type LiaseQueryExecution = typeof liaseQueryExecution.$inferSelect;

/*
liaseQueryExecutionLog

A log entry created during the execution of a liase query, recording warnings and errors.
*/
export const liaseQueryExecutionLog = pgTable("liase_query_execution_log", {
  id: serial("id").notNull().primaryKey(),
  createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
  executionId: integer("execution_id")
    .notNull()
    .references(() => liaseQueryExecution.id),
  level: logLevelEnum("level").notNull(),
  message: text("message").notNull(),
  context: jsonb("context"),
});

export const liaseQueryExecutionLogRelations = relations(
  liaseQueryExecutionLog,
  ({ one }) => ({
    execution: one(liaseQueryExecution, {
      fields: [liaseQueryExecutionLog.executionId],
      references: [liaseQueryExecution.id],
    }),
  }),
);

export type LiaseQueryExecutionLog = typeof liaseQueryExecutionLog.$inferSelect;

/*
liaseQueryMedia

There is a liaseQueryMedia created for every Liase media found when executing a
Liase query. To avoid duplication the actual contents of the Liase media isn't included
here. Instead the hash of the contents is recorded and can be used to retrieve the actual contents from
liaseQueryMediaContent.
*/
export const liaseQueryMedia = pgTable(
  "liase_query_media",
  {
    id: serial("id").notNull().primaryKey(),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { precision: 3 }).notNull(),
    liaseId: text("liase_id").notNull(),
    contentHash: text("content_hash")
      .notNull()
      .references(() => liaseQueryMediaContent.contentHash),
    foundInLatestExecution: boolean("found_in_latest_execution")
      .notNull()
      .default(true),
    queryExecutionIdCreatedOn: integer(
      "query_execution_id_created_on",
    ).references(() => liaseQueryExecution.id),
    queryId: integer("query_id").references(() => liaseQuery.id),
  },
  (t) => [
    unique("liase_query_media__content_hash_query_id_unique").on(
      t.contentHash,
      t.queryId,
    ),
  ],
);

explain(liaseQueryMedia, {
  columns: {
    liaseId:
      "A combination of the source and ID of media returned by Liase in the form `liaseSourceId<TAB>liaseMediaId`.",
  },
});

export const liaseQueryMediaRelations = relations(
  liaseQueryMedia,
  ({ one }) => ({
    content: one(liaseQueryMediaContent, {
      fields: [liaseQueryMedia.contentHash],
      references: [liaseQueryMediaContent.contentHash],
    }),
  }),
);

export type LiaseQueryMedia = typeof liaseQueryMedia.$inferSelect;

/*
liaseQueryMediaContent

The contents of a Liase media found when executing a media query.
*/
export const liaseQueryMediaContent = pgTable("liase_query_media_content", {
  contentHash: text("content_hash").notNull().primaryKey(),
  createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { precision: 3 }).notNull(),
  liaseId: text("liase_id").notNull(),
  content: liaseMedia("content").notNull(), // This should be unique because contentHash is guaranteed to be unique
  // but we don't want to actually set the column to be unique values only since that limits the length of the
  // row to ~2000 chars which content can sometimes exceed
});

explain(liaseQueryMediaContent, {
  columns: {
    liaseId:
      "A combination of the source and ID of media returned by Liase in the form `liaseSourceId<TAB>liaseMediaId`.",
  },
});

export const liaseQueryMediaContentRelations = relations(
  liaseQueryMediaContent,
  ({ many }) => ({
    liaseQueryMedia: many(liaseQueryMedia),
  }),
);

export type LiaseQueryMediaContent = typeof liaseQueryMediaContent.$inferSelect;

/*
userCacheMediaInfo

Stores per-user, per-media info (e.g. favourited status). Generalised so
additional user-level fields can be added in future without a new table.
*/
export const userCacheMediaInfo = pgTable(
  "user_cache_media_info",
  {
    id: serial("id").notNull().primaryKey(),
    createdAt: timestamp("created_at", { precision: 3 }).notNull().defaultNow(),
    userId: integer("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cacheMediaId: integer("cache_media_id")
      .notNull()
      .references(() => cacheMedia.id, { onDelete: "cascade" }),
    favourited: boolean("favourited").notNull().default(false),
  },
  (t) => [
    uniqueIndex("user_cache_media_info__user_id_cache_media_id_idx").on(
      t.userId,
      t.cacheMediaId,
    ),
  ],
);

export type UserCacheMediaInfo = typeof userCacheMediaInfo.$inferSelect;
