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
  finderSourceMediaIds: text('finder_source_media_ids')
    .array(2)
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[][]`),
  // These are 2d arrays because instead of just storing the group id we store a tuple of [group id, parent group id] to make it easier to query for only subgroups of a specific group without needing to join with the group table to check the parent group id
  groupIds: integer('group_ids') // groups here are populated based on the media finder results
    .array(2)
    .array()
    .notNull()
    .default(sql`ARRAY[]::int[][]`),
  originalGroupIds: integer('original_group_ids') // groups here are not from media finder results
    .array(2)
    .array()
    .notNull()
    .default(sql`ARRAY[]::int[][]`),
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
  finderSourceMediaIds: index('cache_media__finder_source_media_ids_idx').on(cacheMedia.finderSourceMediaIds),
  groupIdsIndex: index('cache_media__group_ids_idx').on(cacheMedia.groupIds),
  originalGroupIdsIndex: index('cache_media__original_group_ids_idx').on(cacheMedia.originalGroupIds),
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
  mediaFound: integer('media_found').notNull(),
  mediaNew: integer('media_new').notNull(),
  mediaUpdated: integer('media_updated').notNull(),
  mediaRemoved: integer('media_removed').notNull(),
  mediaNotSuitable: integer('media_not_suitable').notNull(),
  mediaUnchanged: integer('media_unchanged').notNull(),
  warningCount: integer('warning_count').notNull(),
  nonFatalErrorCount: integer('non_fatal_error_count').notNull(),
  fatalErrorCount: integer('fatal_error_count').notNull(),
  queryId: integer('query_id').references(() => finderQuery.id),
})

export const finderQueryExecutionRelations = relations(finderQueryExecution, ({ one, many }) => ({
  query: one(finderQuery, {
    fields: [finderQueryExecution.queryId],
    references: [finderQuery.id],
  }),
  finderMedia: many(finderQueryMedia),
}))

export type FinderQueryExecution = typeof finderQueryExecution.$inferSelect

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
