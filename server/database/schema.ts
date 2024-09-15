import { relations } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { boolean, doublePrecision, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

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

export const SourceRelations = relations(source, ({ many }) => ({
  cachedMediaSourceInfo: many(cacheMediaSource),
}))

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
})

export const cacheMediaRelations = relations(cacheMedia, ({ many }) => ({
  files: many(cacheMediaFile),
  userSpecificInfo: many(cacheMediaUser),
  sourceSpecificInfo: many(cacheMediaSource),
  groups: many(cacheMediaGroup),
}))

export type CacheMedia = typeof cacheMedia.$inferSelect

/*
cacheMediaSource

cacheMedia can have multiple sources so each cacheMedia has at least 1 cacheMediaSource which
contains media info that is specific to that particular source rather than info that is the same
no matter what source it comes from.
*/
export const cacheMediaSource = pgTable('cache_media_source', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  sourceUploadedAt: timestamp('source_uploaded_at', { precision: 3 }),
  title: text('title'),
  description: text('description'),
  url: text('url'),
  creator: text('creator'),
  uploader: text('uploader'),
  views: integer('views'),
  likes: integer('likes'),
  likesPercentage: doublePrecision('likes_percentage'),
  dislikes: integer('dislikes'),
  finderSourceId: text('finder_source_id').notNull().references(() => source.finderSourceId),
  finderMediaId: text('finder_media_id').notNull(),
  cacheMediaId: integer('cache_media_id').notNull().references(() => cacheMedia.id),
}, cacheMediaSource => ({
  cacheMediaIdIdx: index('cache_media_id_idx').on(cacheMediaSource.cacheMediaId),
  // A cacheMedia should have a maximum of 1 cacheMediaSource per source
  uniquePerSourceIdx:
    uniqueIndex('unique_per_source_idx')
      .on(cacheMediaSource.finderSourceId, cacheMediaSource.cacheMediaId),
  // Maximum of 1 cacheMediaSource per finder media
  uniquePerFinderMediaIdx:
    uniqueIndex('unique_per_finder_media_idx_key')
      .on(cacheMediaSource.finderSourceId, cacheMediaSource.finderMediaId),
}))

export const cacheMediaSourceRelations = relations(cacheMediaSource, ({ one }) => ({
  source: one(source, {
    fields: [cacheMediaSource.finderSourceId],
    references: [source.finderSourceId],
  }),
  media: one(cacheMedia, {
    fields: [cacheMediaSource.cacheMediaId],
    references: [cacheMedia.id],
  }),
}))

export type CacheMediaSource = typeof cacheMediaSource.$inferSelect

/*
cacheMediaFile

cacheMedia often have multiple associated files (for example a thumbnail and a full sized file) so cacheMediaFile
includes info about each cacheMedia file.
*/
export const cacheMediaFile = pgTable('cache_media_file', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  mediaId: integer('media_id').notNull().references(() => cacheMedia.id),
  finderSourceId: text('finder_source_id').notNull(),
  finderMediaId: text('finder_media_id').notNull(),
  type: text('type').notNull(),
  url: text('url').notNull(),
  ext: text('ext'),
  mimeType: text('mime_type'),
  hasVideo: boolean('has_video'),
  hasAudio: boolean('has_audio'),
  hasImage: boolean('has_image'),
  duration: doublePrecision('duration'),
  fileSize: integer('file_size'),
  width: integer('width'),
  height: integer('height'),
  urlExpires: timestamp('url_expires', { precision: 3 }),
  urlRefreshDetails: text('url_refresh_details'),
}, cacheMediaFile => ({
  mediaIdIdx: index('cache_media_file__media_id_idx').on(cacheMediaFile.mediaId),
  // Max of 1 cacheMediaFile per file type of a finder media
  uniquePerFinderMediaFileTypeIdx: uniqueIndex('cache_media_file__unique_per_finder_media_file_type_idx')
    .on(cacheMediaFile.finderSourceId, cacheMediaFile.finderMediaId, cacheMediaFile.type),
}))

export const cacheMediaFileRelations = relations(cacheMediaFile, ({ one }) => ({
  media: one(cacheMedia, {
    fields: [cacheMediaFile.mediaId],
    references: [cacheMedia.id],
  }),
}))

export type CacheMediaFile = typeof cacheMediaFile.$inferSelect

/*
cacheMediaUser

cacheMedia info that is specific to a given Media Cache user. For example whether a user has
favoured a cacheMedia or not.
*/
export const cacheMediaUser = pgTable('cache_media_user', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  userId: integer('user_id').notNull().references(() => user.id),
  mediaId: integer('media_id').notNull().references(() => cacheMedia.id),
}, cacheMediaUser => ({
  mediaIdIdx: index('cache_media_user__media_id_idx').on(cacheMediaUser.mediaId),
  // Max of 1 per user for each media
  uniquePerUserPerMediaIdx:
    uniqueIndex('unique_per_user_per_media_idx')
      .on(cacheMediaUser.mediaId, cacheMediaUser.userId),
}))

export const cacheMediaUserRelations = relations(cacheMediaUser, ({ one }) => ({
  user: one(user, {
    fields: [cacheMediaUser.userId],
    references: [user.id],
  }),
  media: one(cacheMedia, {
    fields: [cacheMediaUser.mediaId],
    references: [cacheMedia.id],
  }),
}))

export type CacheMediaUser = typeof cacheMediaUser.$inferSelect

/*
cacheMediaGroup

Related groups which a cacheMedia belongs to.
*/
export const cacheMediaGroup = pgTable('cache_media_group', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  groupId: integer('group_id').notNull().references(() => group.id),
  mediaId: integer('media_id').notNull().references(() => cacheMedia.id),
}, cacheMediaGroup => ({
  mediaIdIdx: index('cache_media_group__media_id_idx').on(cacheMediaGroup.mediaId),
  // Max of 1 per group for each media
  uniquePerGroupPerMediaIdx:
    uniqueIndex('cache_media_group__unique_per_group_per_media_idx')
      .on(cacheMediaGroup.mediaId, cacheMediaGroup.groupId),
}))

export const cacheMediaGroupRelations = relations(cacheMediaGroup, ({ one }) => ({
  group: one(group, {
    fields: [cacheMediaGroup.groupId],
    references: [group.id],
  }),
  media: one(cacheMedia, {
    fields: [cacheMediaGroup.mediaId],
    references: [cacheMedia.id],
  }),
}))

export type CacheMediaGroup = typeof cacheMediaGroup.$inferSelect

/*
group

A group which a cacheMedia can belong to.
*/
export const group = pgTable('group', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  parentId: integer('parent_id').references((): AnyPgColumn => group.id),
  name: text('name'),
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
  finderMedia: many(finderQueryExecutionMedia),
}))

export type FinderQueryExecution = typeof finderQueryExecution.$inferSelect

/*
finderQueryExecutionMedia

There is a finderQueryExecutionMedia created for every Media Finder media found when executing a
Media Finder query. To avoid duplication the actual contents of the Media Finder media isn't included
here. Instead the hash of the contents is recorded and can be used to retrieve the actual contents from
finderQueryExecutionMediaContent.
*/
export const finderQueryExecutionMedia = pgTable('finder_query_execution_media', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  source: text('source').notNull(),
  mediaId: text('media_id').notNull(),
  contentHash: text('content_hash').notNull().references(() => finderQueryExecutionMediaContent.contentHash),
  queryExecutionId: integer('query_execution_id').notNull().references(() => finderQueryExecution.id),
})

export const finderQueryExecutionMediaRelations = relations(finderQueryExecutionMedia, ({ one }) => ({
  content: one(finderQueryExecutionMediaContent, {
    fields: [finderQueryExecutionMedia.contentHash],
    references: [finderQueryExecutionMediaContent.contentHash],
  }),
  finderQueryExecution: one(finderQueryExecution, {
    fields: [finderQueryExecutionMedia.queryExecutionId],
    references: [finderQueryExecution.id],
  }),
}))

export type FinderQueryExecutionMedia = typeof finderQueryExecutionMedia.$inferSelect

/*
finderQueryExecutionMediaContent

The contents of a Media Finder media found when executing a media query.
*/
export const finderQueryExecutionMediaContent = pgTable('finder_query_execution_media_content', {
  contentHash: text('content_hash').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  source: text('source').notNull(),
  mediaId: text('media_id').notNull(),
  content: text('content').notNull().unique(),
})

export const finderQueryExecutionMediaContentRelations = relations(finderQueryExecutionMediaContent, ({ many }) => ({
  finderQueryExecutionMedia: many(finderQueryExecutionMedia),
}))

export type FinderQueryExecutionMediaContent = typeof finderQueryExecutionMediaContent.$inferSelect

/*
mergedCacheMedia

A record of one media being merged into another. This can be used to connect the original media id
of a media that no longer exists after being merged, to the media it was merged into.
*/
export const mergedCacheMedia = pgTable('merged_cache_media', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  currentMediaId: integer('current_media_id').notNull(),
  originalMediaId: integer('original_media_id').notNull().unique(),
})

export type MergedCacheMedia = typeof mergedCacheMedia.$inferSelect
