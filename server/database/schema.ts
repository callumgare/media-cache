import { relations } from 'drizzle-orm'
import { boolean, doublePrecision, integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const User = pgTable('User', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  username: text('username').notNull(),
})

export const Media = pgTable('Media', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  title: text('title'),
  description: text('description'),
  fileHash: text('fileHash'),
  draft: boolean('draft').notNull(),
})

export const SourceMediaDetails = pgTable('SourceMediaDetails', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  sourceUploadedAt: timestamp('sourceUploadedAt', { precision: 3 }),
  title: text('title'),
  description: text('description'),
  url: text('url'),
  creator: text('creator'),
  uploader: text('uploader'),
  views: integer('views'),
  likes: integer('likes'),
  likesPercentage: doublePrecision('likesPercentage'),
  dislikes: integer('dislikes'),
  finderSourceId: text('finderSourceId').notNull().references(() => Source.finderSourceId),
  finderMediaId: text('finderMediaId').notNull(),
  mediaId: integer('mediaId').notNull().references(() => Media.id),
}, SourceMediaDetails => ({
  SourceMediaDetails_finderSourceId_mediaId_unique_idx: uniqueIndex('SourceMediaDetails_finderSourceId_mediaId_key')
    .on(SourceMediaDetails.finderSourceId, SourceMediaDetails.mediaId),
  SourceMediaDetails_finderSourceId_finderMediaId_unique_idx: uniqueIndex('SourceMediaDetails_finderSourceId_finderMediaId_key')
    .on(SourceMediaDetails.finderSourceId, SourceMediaDetails.finderMediaId),
}))

export const File = pgTable('File', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  mediaId: integer('mediaId').notNull().references(() => Media.id),
  finderSourceId: text('finderSourceId').notNull(),
  finderMediaId: text('finderMediaId').notNull(),
  type: text('type').notNull(),
  url: text('url').notNull(),
  ext: text('ext'),
  mimeType: text('mimeType'),
  hasVideo: boolean('hasVideo'),
  hasAudio: boolean('hasAudio'),
  hasImage: boolean('hasImage'),
  duration: doublePrecision('duration'),
  fileSize: integer('fileSize'),
  width: integer('width'),
  height: integer('height'),
  urlExpires: timestamp('urlExpires', { precision: 3 }),
  urlRefreshDetails: text('urlRefreshDetails'),
}, File => ({
  File_finderSourceId_finderMediaId_type_unique_idx: uniqueIndex('File_finderSourceId_finderMediaId_type_key')
    .on(File.finderSourceId, File.finderMediaId, File.type),
}))

export const Source = pgTable('Source', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  finderSourceId: text('finderSourceId').notNull().unique(),
})

export const Group = pgTable('Group', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  name: text('name'),
})

export const GroupEntry = pgTable('GroupEntry', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  parentId: integer('parentId').references(() => GroupEntry.id),
  groupId: integer('groupId').references(() => Group.id),
  groupName: text('groupName'),
  mediaId: integer('mediaId').references(() => Media.id),
}, GroupEntry => ({
  GroupEntry_parentId_groupId_mediaId_unique_idx: uniqueIndex('GroupEntry_parentId_groupId_mediaId_key')
    .on(GroupEntry.parentId, GroupEntry.groupId, GroupEntry.mediaId),
  GroupEntry_parentId_mediaId_groupName_unique_idx: uniqueIndex('GroupEntry_parentId_mediaId_groupName_key')
    .on(GroupEntry.parentId, GroupEntry.mediaId, GroupEntry.groupName),
}))

export const MediaFinderSettings = pgTable('MediaFinderSettings', {
  key: text('key').notNull().primaryKey(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  value: text('value').notNull(),
})

export const MediaFinderQuery = pgTable('MediaFinderQuery', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  title: text('title').notNull(),
  requestOptions: text('requestOptions').notNull(),
  schedule: integer('schedule').notNull(),
})

export const MediaFinderHistory = pgTable('MediaFinderHistory', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  startDate: timestamp('startDate', { precision: 3 }).notNull(),
  endDate: timestamp('endDate', { precision: 3 }).notNull(),
  found: integer('found').notNull(),
  new: integer('new').notNull(),
  updated: integer('updated').notNull(),
  removed: integer('removed').notNull(),
  notSuitable: integer('notSuitable').notNull(),
  unchanged: integer('unchanged').notNull(),
  warningCount: integer('warningCount').notNull(),
  nonFatalErrorCount: integer('nonFatalErrorCount').notNull(),
  fatalErrorCount: integer('fatalErrorCount').notNull(),
  queryId: integer('queryId').notNull().references(() => MediaFinderQuery.id),
})

export const MediaFinderResponseItemMap = pgTable('MediaFinderResponseItemMap', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  source: text('source').notNull(),
  itemId: text('itemId').notNull(),
  itemType: text('itemType').notNull(),
  contentHash: text('contentHash').notNull().references(() => MediaFinderResponseItemContent.contentHash),
  queryHistoryId: integer('queryHistoryId').notNull().references(() => MediaFinderHistory.id),
})

export const MediaFinderResponseItemContent = pgTable('MediaFinderResponseItemContent', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  source: text('source').notNull(),
  itemId: text('itemId').notNull(),
  itemType: text('itemType').notNull(),
  content: text('content').notNull().unique(),
  contentHash: text('contentHash').notNull().unique(),
})

export const MergedMediaIndex = pgTable('MergedMediaIndex', {
  id: serial('id').notNull().primaryKey(),
  createdAt: timestamp('createdAt', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { precision: 3 }).notNull(),
  currentMediaId: integer('currentMediaId').notNull(),
  originalMediaId: integer('originalMediaId').notNull().unique(),
})

export const MediaRelations = relations(Media, ({ many }) => ({
  sourceDetails: many(SourceMediaDetails, {
    relationName: 'MediaToSourceMediaDetails',
  }),
  files: many(File, {
    relationName: 'FileToMedia',
  }),
  GroupEntry: many(GroupEntry, {
    relationName: 'GroupEntryToMedia',
  }),
}))

export const SourceMediaDetailsRelations = relations(SourceMediaDetails, ({ one }) => ({
  source: one(Source, {
    relationName: 'SourceToSourceMediaDetails',
    fields: [SourceMediaDetails.finderSourceId],
    references: [Source.finderSourceId],
  }),
  media: one(Media, {
    relationName: 'MediaToSourceMediaDetails',
    fields: [SourceMediaDetails.mediaId],
    references: [Media.id],
  }),
}))

export const FileRelations = relations(File, ({ one }) => ({
  media: one(Media, {
    relationName: 'FileToMedia',
    fields: [File.mediaId],
    references: [Media.id],
  }),
}))

export const SourceRelations = relations(Source, ({ many }) => ({
  SourceMediaDetails: many(SourceMediaDetails, {
    relationName: 'SourceToSourceMediaDetails',
  }),
}))

export const GroupRelations = relations(Group, ({ many }) => ({
  GroupEntry: many(GroupEntry, {
    relationName: 'GroupToGroupEntry',
  }),
}))

export const GroupEntryRelations = relations(GroupEntry, ({ one, many }) => ({
  parent: one(GroupEntry, {
    relationName: 'GroupEntry',
    fields: [GroupEntry.parentId],
    references: [GroupEntry.id],
  }),
  children: many(GroupEntry, {
    relationName: 'GroupEntry',
  }),
  group: one(Group, {
    relationName: 'GroupToGroupEntry',
    fields: [GroupEntry.groupId],
    references: [Group.id],
  }),
  media: one(Media, {
    relationName: 'GroupEntryToMedia',
    fields: [GroupEntry.mediaId],
    references: [Media.id],
  }),
}))

export const MediaFinderQueryRelations = relations(MediaFinderQuery, ({ many }) => ({
  MediaFinderHistory: many(MediaFinderHistory, {
    relationName: 'MediaFinderHistoryToMediaFinderQuery',
  }),
}))

export const MediaFinderHistoryRelations = relations(MediaFinderHistory, ({ one, many }) => ({
  query: one(MediaFinderQuery, {
    relationName: 'MediaFinderHistoryToMediaFinderQuery',
    fields: [MediaFinderHistory.queryId],
    references: [MediaFinderQuery.id],
  }),
  MediaFinderResult: many(MediaFinderResponseItemMap, {
    relationName: 'MediaFinderHistoryToMediaFinderResponseItemMap',
  }),
}))

export const MediaFinderResponseItemMapRelations = relations(MediaFinderResponseItemMap, ({ one }) => ({
  content: one(MediaFinderResponseItemContent, {
    relationName: 'MediaFinderResponseItemContentToMediaFinderResponseItemMap',
    fields: [MediaFinderResponseItemMap.contentHash],
    references: [MediaFinderResponseItemContent.contentHash],
  }),
  queryHistory: one(MediaFinderHistory, {
    relationName: 'MediaFinderHistoryToMediaFinderResponseItemMap',
    fields: [MediaFinderResponseItemMap.queryHistoryId],
    references: [MediaFinderHistory.id],
  }),
}))

export const MediaFinderResponseItemContentRelations = relations(MediaFinderResponseItemContent, ({ many }) => ({
  responseItems: many(MediaFinderResponseItemMap, {
    relationName: 'MediaFinderResponseItemContentToMediaFinderResponseItemMap',
  }),
}))
