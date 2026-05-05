import { relations, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { boolean, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

/*
user

A user of the Media Cache app
*/
export const user = pgTable('user', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  username: text('username').notNull(),
})

export type User = typeof user.$inferSelect

/*
source

Information about Media Finder source
*/
export const source = pgTable('source', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  finderSourceId: text('finder_source_id').notNull().unique(),
})

export type Source = typeof source.$inferSelect

/*
cacheMedia

A cached piece of media in Media Cache
*/
export const cacheMedia = pgTable('cache_media', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  title: text('title'),
  description: text('description'),
  earliestUploadedAt: timestamp('earliest_uploaded_at', { precision: 3 }),
  creators: text('creators')
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  uploaders: text('uploaders')
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  views: integer('views'),
  likes: integer('likes'),
  dislikes: integer('dislikes'),
  // GIN-indexed array of plain source names (e.g. 'chan-browser') for source-only filters.
  finderSourceIds: text('finder_source_ids')
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  // GIN-indexed array of 'sourceId<TAB>mediaId' composites for exact source+media lookups.
  finderSourceMediaIds: text('finder_source_media_ids')
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  // GIN-indexed array of group IDs (as text) the media belongs to,
  // populated from media finder results.
  groupIds: text('group_ids')
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  // GIN-indexed array of group IDs for manually-assigned groups.
  originalGroupIds: text('original_group_ids')
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  // GIN-indexed array of tab-separated group hierarchy paths (leaf<TAB>parent<TAB>...<TAB>root<TAB>)
  // for each group in groupIds. Enables ancestor-aware filtering.
  groupPaths: text('group_paths')
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  // Same as groupPaths but for originalGroupIds.
  originalGroupPaths: text('original_group_paths')
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  hasVideo: boolean('has_video'),
  hasAudio: boolean('has_audio'),
  hasImage: boolean('has_image'),
  duration: doublePrecision('duration'),
  fileSize: integer('file_size'),
  width: integer('width'),
  height: integer('height'),
  files: jsonb('files')
    .$type<
    {
      createdAt: Date
      updatedAt: Date
      finderSourceId: string
      finderMediaId: string
      type: string
      url: string
      ext: string | null
      mimeType: string | null
      hasVideo: boolean | null
      hasAudio: boolean | null
      hasImage: boolean | null
      duration: number | null
      fileSize: number | null
      width: number | null
      height: number | null
      urlExpires: Date | null
      urlRefreshDetails: string | null
      urlUpdatedAt: Date
    }[]>(),
  sources: jsonb('sources')
    .$type<
    {
      finderSourceId: string
      finderMediaId: string
      createdAt: Date
      updatedAt: Date
      uploadedAt: Date | null
      title: string | null
      description: string | null
      url: string | null
      creator: string | null
      uploader: string | null
      views: number | null
      likes: number | null
      likesPercentage: number | null
      dislikes: number | null
    }[]>(),
}, cacheMedia => ({
  hasVideoIndex: index('cache_media__has_video_idx').on(cacheMedia.hasVideo),
  hasImageIndex: index('cache_media__has_image_idx').on(cacheMedia.hasImage),
  hasAudioIndex: index('cache_media__has_audio_idx').on(cacheMedia.hasAudio),
  durationIndex: index('cache_media__duration_idx').on(cacheMedia.duration),
  finderSourceIdsGinIndex: index('cache_media__finder_source_ids_gin_idx').using('gin', cacheMedia.finderSourceIds),
  finderSourceMediaIdsGinIndex: index('cache_media__finder_source_media_ids_gin_idx').using('gin', cacheMedia.finderSourceMediaIds),
  groupIdsGinIndex: index('cache_media__group_ids_gin_idx').using('gin', cacheMedia.groupIds),
  originalGroupIdsGinIndex: index('cache_media__original_group_ids_gin_idx').using('gin', cacheMedia.originalGroupIds),
  groupPathsGinIndex: index('cache_media__group_paths_gin_idx').using('gin', cacheMedia.groupPaths),
  originalGroupPathsGinIndex: index('cache_media__original_group_paths_gin_idx').using('gin', cacheMedia.originalGroupPaths),
  fileSizeIndex: index('cache_media__file_size_idx').on(cacheMedia.fileSize),
  heightIndex: index('cache_media__height_idx').on(cacheMedia.height),
  widthIndex: index('cache_media__width_idx').on(cacheMedia.width),
}))

export type CacheMedia = typeof cacheMedia.$inferSelect

/*
deletedCacheMedia

A record of cacheMedia that have been deleted. If deleted as the contents was merged into other media then
it also tracks the id of the cacheMedia it was merged into so that any references to it can be redirected.
*/
export const deletedCacheMedia = pgTable('deleted_cache_media', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  cacheMediaId: integer('cache_media_id').notNull().unique(),
  deletionReason: text('deletion_reason').notNull(),
  mergedIntoCacheMediaId: integer('merged_into_cache_media_id').references(() => cacheMedia.id),
})

export const deletedCacheMediaRelations = relations(deletedCacheMedia, ({ one }) => ({
  mergedIntoCacheMedia: one(cacheMedia, {
    fields: [deletedCacheMedia.mergedIntoCacheMediaId],
    references: [cacheMedia.id],
  }),
}))

export type DeletedCacheMedia = typeof deletedCacheMedia.$inferSelect

/*
group

A group which a cacheMedia can belong to.
*/
export const group = pgTable('group', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  parentId: integer('parent_id').references((): AnyPgColumn => group.id),
  name: text('name').notNull(),
}, group => ({
  childGroupNamesUniqueIdx: uniqueIndex('child_group_names_unique_idx')
    .on(group.parentId, group.name),
}))

export const groupRelations = relations(group, ({ one, many }) => ({
  parent: one(group, {
    relationName: 'parent-child',
    fields: [group.parentId],
    references: [group.id],
  }),
  children: many(group, {
    relationName: 'parent-child',
  }),
}))

export type Group = typeof group.$inferSelect

/*
finderQuery

The details for a query to be executed with Media Finder
*/
export const finderQuery = pgTable('finder_query', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  title: text('title').notNull(),
  requestOptions: text('request_options').notNull(),
  fetchCountLimit: integer('fetch_count_limit'),
  schedule: integer('schedule').notNull(),
})

export const finderQueryRelations = relations(finderQuery, ({ many }) => ({
  finderQueryExecutions: many(finderQueryExecution),
}))

export type FinderQuery = typeof finderQuery.$inferSelect

/*
finderQueryExecution

A finderQueryExecution is created every time a media finder query is executed with details about how that
execution went/is going.
*/
export const finderQueryExecution = pgTable('finder_query_execution', {
  id: serial('id').notNull().primaryKey(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  startedAt: timestamp('started_at', { precision: 3 }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { precision: 3 }).notNull(),
  status: text('status').notNull().default('running'), // 'running' | 'completed' | 'failed'
  mediaFound: integer('media_found').notNull().default(-1),
  mediaNew: integer('media_new').notNull().default(-1),
  mediaUpdated: integer('media_updated').notNull().default(-1),
  mediaRemoved: integer('media_removed').notNull().default(-1),
  mediaNotSuitable: integer('media_not_suitable').notNull().default(-1),
  mediaUnchanged: integer('media_unchanged').notNull().default(-1),
  pageCount: integer('page_count').notNull().default(-1),
  warningCount: integer('warning_count').notNull().default(0),
  nonFatalErrorCount: integer('non_fatal_error_count').notNull().default(0),
  fatalErrorCount: integer('fatal_error_count').notNull().default(0),
  queryId: integer('query_id').references(() => finderQuery.id),
})

export const finderQueryExecutionRelations = relations(finderQueryExecution, ({ one, many }) => ({
  query: one(finderQuery, {
    fields: [finderQueryExecution.queryId],
    references: [finderQuery.id],
  }),
  finderMedia: many(finderQueryMedia),
  logs: many(finderQueryExecutionLog),
}))

export type FinderQueryExecution = typeof finderQueryExecution.$inferSelect

/*
finderQueryExecutionLog

A log entry created during the execution of a finder query, recording warnings and errors.
*/
export const finderQueryExecutionLog = pgTable('finder_query_execution_log', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  executionId: integer('execution_id').notNull().references(() => finderQueryExecution.id),
  level: text('level').notNull(), // 'warning' | 'non_fatal_error' | 'fatal_error'
  message: text('message').notNull(),
  context: jsonb('context'),
})

export const finderQueryExecutionLogRelations = relations(finderQueryExecutionLog, ({ one }) => ({
  execution: one(finderQueryExecution, {
    fields: [finderQueryExecutionLog.executionId],
    references: [finderQueryExecution.id],
  }),
}))

export type FinderQueryExecutionLog = typeof finderQueryExecutionLog.$inferSelect

/*
finderQueryMedia

There is a finderQueryMedia created for every Media Finder media found when executing a
Media Finder query. To avoid duplication the actual contents of the Media Finder media isn't included
here. Instead the hash of the contents is recorded and can be used to retrieve the actual contents from
finderQueryMediaContent.
*/
export const finderQueryMedia = pgTable('finder_query_media', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  finderSourceId: text('finder_source_id').notNull(),
  finderMediaId: text('finder_media_id').notNull(),
  contentHash: text('content_hash').notNull().references(() => finderQueryMediaContent.contentHash),
  queryExecutionId: integer('query_execution_id').references(() => finderQueryExecution.id),
})

export const finderQueryMediaRelations = relations(finderQueryMedia, ({ one }) => ({
  content: one(finderQueryMediaContent, {
    fields: [finderQueryMedia.contentHash],
    references: [finderQueryMediaContent.contentHash],
  }),
  finderQueryExecution: one(finderQueryExecution, {
    fields: [finderQueryMedia.queryExecutionId],
    references: [finderQueryExecution.id],
  }),
}))

export type FinderQueryMedia = typeof finderQueryMedia.$inferSelect

/*
finderQueryMediaContent

The contents of a Media Finder media found when executing a media query.
*/
export const finderQueryMediaContent = pgTable('finder_query_media_content', {
  contentHash: text('content_hash').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  finderSourceId: text('finder_source_id').notNull(),
  finderMediaId: text('finder_media_id').notNull(),
  content: text('content').notNull(), // This should be unique because contentHash is guaranteed to be unique
  // but we don't want to actually set the column to be unique values only since that limits the length of the
  // row to ~2000 chars which content can sometimes exceed
})

export const finderQueryMediaContentRelations = relations(finderQueryMediaContent, ({ many }) => ({
  finderQueryMedia: many(finderQueryMedia),
}))

export type FinderQueryMediaContent = typeof finderQueryMediaContent.$inferSelect
