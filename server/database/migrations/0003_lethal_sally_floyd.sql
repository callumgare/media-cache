DROP TABLE IF EXISTS "_prisma_migrations";--> statement-breakpoint
ALTER TABLE "MediaFinderResponseItemContent" DROP CONSTRAINT IF EXISTS "MediaFinderResponseItemContent_content_unique";--> statement-breakpoint
ALTER TABLE "MediaFinderResponseItemContent" ADD CONSTRAINT "MediaFinderResponseItemContent_content_unique" UNIQUE (content);--> statement-breakpoint
ALTER TABLE "MergedMediaIndex" DROP CONSTRAINT IF EXISTS "MergedMediaIndex_originalMediaId_unique";--> statement-breakpoint
ALTER TABLE "MergedMediaIndex" ADD CONSTRAINT "MergedMediaIndex_originalMediaId_unique" UNIQUE ("originalMediaId");--> statement-breakpoint
ALTER TABLE "File" DROP CONSTRAINT IF EXISTS "File_mediaId_fkey";--> statement-breakpoint
ALTER TABLE "GroupEntry" DROP CONSTRAINT IF EXISTS "GroupEntry_groupId_fkey";--> statement-breakpoint
ALTER TABLE "GroupEntry" DROP CONSTRAINT IF EXISTS "GroupEntry_mediaId_fkey";--> statement-breakpoint
ALTER TABLE "GroupEntry" DROP CONSTRAINT IF EXISTS "GroupEntry_parentId_fkey";--> statement-breakpoint
ALTER TABLE "MediaFinderHistory" DROP CONSTRAINT IF EXISTS "MediaFinderHistory_queryId_fkey";--> statement-breakpoint
ALTER TABLE "MediaFinderResponseItemMap" DROP CONSTRAINT IF EXISTS "MediaFinderResponseItemMap_contentHash_fkey";--> statement-breakpoint
ALTER TABLE "MediaFinderResponseItemMap" DROP CONSTRAINT IF EXISTS "MediaFinderResponseItemMap_queryHistoryId_fkey";--> statement-breakpoint
ALTER TABLE "SourceMediaDetails" DROP CONSTRAINT IF EXISTS "SourceMediaDetails_finderSourceId_fkey";--> statement-breakpoint
ALTER TABLE "SourceMediaDetails" DROP CONSTRAINT IF EXISTS "SourceMediaDetails_mediaId_fkey";--> statement-breakpoint

ALTER TABLE "MediaFinderResponseItemMap" DROP CONSTRAINT IF EXISTS "MediaFinderResponseItemMap_contentHash_MediaFinderResponseItemC";--> statement-breakpoint
ALTER TABLE "MediaFinderResponseItemContent" DROP CONSTRAINT IF EXISTS "MediaFinderResponseItemContent_contentHash_unique";--> statement-breakpoint
ALTER TABLE "MediaFinderResponseItemContent" ADD CONSTRAINT "MediaFinderResponseItemContent_contentHash_unique" UNIQUE ("contentHash");--> statement-breakpoint
DROP INDEX IF EXISTS "MediaFinderResponseItemContent_contentHash_key";--> statement-breakpoint
ALTER TABLE "MediaFinderResponseItemMap" ADD CONSTRAINT "MediaFinderResponseItemMap_contentHash_MediaFinderResponseItemC" FOREIGN KEY ("contentHash") REFERENCES "MediaFinderResponseItemContent"("contentHash");--> statement-breakpoint

DROP INDEX IF EXISTS "MediaFinderResponseItemContent_content_key";--> statement-breakpoint
DROP INDEX IF EXISTS "MergedMediaIndex_originalMediaId_key";--> statement-breakpoint

ALTER TABLE "SourceMediaDetails" DROP CONSTRAINT IF EXISTS "SourceMediaDetails_finderSourceId_Source_finderSourceId_fk";--> statement-breakpoint
ALTER TABLE "Source" DROP CONSTRAINT IF EXISTS "Source_finderSourceId_unique";--> statement-breakpoint
ALTER TABLE "Source" ADD CONSTRAINT "Source_finderSourceId_unique" UNIQUE ("finderSourceId");--> statement-breakpoint
DROP INDEX IF EXISTS "Source_finderSourceId_key";--> statement-breakpoint
ALTER TABLE "SourceMediaDetails" ADD CONSTRAINT "SourceMediaDetails_finderSourceId_Source_finderSourceId_fk" FOREIGN KEY ("finderSourceId") REFERENCES "Source"("finderSourceId");--> statement-breakpoint




CREATE TABLE IF NOT EXISTS "cache_media_group" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"group_id" integer NOT NULL,
	"media_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cache_media_user" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"user_id" integer NOT NULL,
	"media_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"parent_id" integer,
	"name" text
);
--> statement-breakpoint
DROP TABLE "GroupEntry";--> statement-breakpoint
DROP TABLE "Group";--> statement-breakpoint
DROP TABLE "MediaFinderSettings";--> statement-breakpoint
ALTER TABLE "Media" RENAME TO "cache_media";--> statement-breakpoint
ALTER TABLE "File" RENAME TO "cache_media_file";--> statement-breakpoint
ALTER TABLE "SourceMediaDetails" RENAME TO "cache_media_source";--> statement-breakpoint
ALTER TABLE "MediaFinderQuery" RENAME TO "finder_query";--> statement-breakpoint
ALTER TABLE "MediaFinderHistory" RENAME TO "finder_query_execution";--> statement-breakpoint
ALTER TABLE "MediaFinderResponseItemMap" RENAME TO "finder_query_execution_media";--> statement-breakpoint
ALTER TABLE "MediaFinderResponseItemContent" RENAME TO "finder_query_execution_media_content";--> statement-breakpoint
ALTER TABLE "MergedMediaIndex" RENAME TO "merged_cache_media";--> statement-breakpoint
ALTER TABLE "Source" RENAME TO "source";--> statement-breakpoint
ALTER TABLE "User" RENAME TO "user";--> statement-breakpoint
ALTER TABLE "cache_media_file" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "cache_media_file" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "cache_media_file" RENAME COLUMN "mediaId" TO "media_id";--> statement-breakpoint
ALTER TABLE "cache_media_file" RENAME COLUMN "finderSourceId" TO "finder_source_id";--> statement-breakpoint
ALTER TABLE "cache_media_file" RENAME COLUMN "finderMediaId" TO "finder_media_id";--> statement-breakpoint
ALTER TABLE "cache_media_file" RENAME COLUMN "mimeType" TO "mime_type";--> statement-breakpoint
ALTER TABLE "cache_media_file" RENAME COLUMN "hasVideo" TO "has_video";--> statement-breakpoint
ALTER TABLE "cache_media_file" RENAME COLUMN "hasAudio" TO "has_audio";--> statement-breakpoint
ALTER TABLE "cache_media_file" RENAME COLUMN "hasImage" TO "has_image";--> statement-breakpoint
ALTER TABLE "cache_media_file" RENAME COLUMN "fileSize" TO "file_size";--> statement-breakpoint
ALTER TABLE "cache_media_file" RENAME COLUMN "urlExpires" TO "url_expires";--> statement-breakpoint
ALTER TABLE "cache_media_file" RENAME COLUMN "urlRefreshDetails" TO "url_refresh_details";--> statement-breakpoint
ALTER TABLE "cache_media" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "cache_media" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME COLUMN "startDate" TO "started_at";--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME COLUMN "endDate" TO "finished_at";--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME COLUMN "found" TO "media_found";--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME COLUMN "new" TO "media_new";--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME COLUMN "updated" TO "media_updated";--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME COLUMN "removed" TO "media_removed";--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME COLUMN "notSuitable" TO "media_not_suitable";--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME COLUMN "unchanged" TO "media_unchanged";--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME COLUMN "warningCount" TO "warning_count";--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME COLUMN "nonFatalErrorCount" TO "non_fatal_error_count";--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME COLUMN "fatalErrorCount" TO "fatal_error_count";--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME COLUMN "queryId" TO "query_id";--> statement-breakpoint
ALTER TABLE "finder_query" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "finder_query" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "finder_query" RENAME COLUMN "requestOptions" TO "request_options";--> statement-breakpoint
ALTER TABLE "finder_query" RENAME COLUMN "fetchCountLimit" TO "fetch_count_limit";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media_content" RENAME COLUMN "contentHash" TO "content_hash";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media_content" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media_content" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media_content" RENAME COLUMN "itemId" TO "media_id";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media" RENAME COLUMN "itemId" TO "media_id";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media" RENAME COLUMN "contentHash" TO "content_hash";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media" RENAME COLUMN "queryHistoryId" TO "query_execution_id";--> statement-breakpoint
ALTER TABLE "merged_cache_media" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "merged_cache_media" RENAME COLUMN "currentMediaId" TO "current_media_id";--> statement-breakpoint
ALTER TABLE "merged_cache_media" RENAME COLUMN "originalMediaId" TO "original_media_id";--> statement-breakpoint
ALTER TABLE "source" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "source" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "source" RENAME COLUMN "finderSourceId" TO "finder_source_id";--> statement-breakpoint
ALTER TABLE "cache_media_source" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "cache_media_source" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "cache_media_source" RENAME COLUMN "sourceUploadedAt" TO "source_uploaded_at";--> statement-breakpoint
ALTER TABLE "cache_media_source" RENAME COLUMN "likesPercentage" TO "likes_percentage";--> statement-breakpoint
ALTER TABLE "cache_media_source" RENAME COLUMN "finderSourceId" TO "finder_source_id";--> statement-breakpoint
ALTER TABLE "cache_media_source" RENAME COLUMN "finderMediaId" TO "finder_media_id";--> statement-breakpoint
ALTER TABLE "cache_media_source" RENAME COLUMN "mediaId" TO "cache_media_id";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media_content" DROP CONSTRAINT "MediaFinderResponseItemContent_content_unique";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media_content" DROP CONSTRAINT "MediaFinderResponseItemContent_contentHash_unique" CASCADE;--> statement-breakpoint
ALTER TABLE "merged_cache_media" DROP CONSTRAINT "MergedMediaIndex_originalMediaId_unique";--> statement-breakpoint
ALTER TABLE "source" DROP CONSTRAINT "Source_finderSourceId_unique" CASCADE;--> statement-breakpoint
ALTER TABLE "cache_media_file" DROP CONSTRAINT "File_mediaId_Media_id_fk";
--> statement-breakpoint
ALTER TABLE "finder_query_execution" DROP CONSTRAINT "MediaFinderHistory_queryId_MediaFinderQuery_id_fk";
--> statement-breakpoint
ALTER TABLE "finder_query_execution_media" DROP CONSTRAINT "MediaFinderResponseItemMap_queryHistoryId_MediaFinderHistory_id_fk";
--> statement-breakpoint
ALTER TABLE "cache_media_source" DROP CONSTRAINT "SourceMediaDetails_mediaId_Media_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "File_media_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "File_finderSourceId_finderMediaId_type_key";--> statement-breakpoint
DROP INDEX IF EXISTS "SourceMediaDetails_media_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "SourceMediaDetails_finderSourceId_mediaId_key";--> statement-breakpoint
DROP INDEX IF EXISTS "SourceMediaDetails_finderSourceId_finderMediaId_key";--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "started_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "query_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "merged_cache_media" ADD COLUMN "created_at" timestamp (3) DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cache_media_group" ADD CONSTRAINT "cache_media_group_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cache_media_group" ADD CONSTRAINT "cache_media_group_media_id_cache_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."cache_media"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cache_media_user" ADD CONSTRAINT "cache_media_user_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cache_media_user" ADD CONSTRAINT "cache_media_user_media_id_cache_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."cache_media"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media_group__media_id_idx" ON "cache_media_group" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cache_media_group__unique_per_group_per_media_idx" ON "cache_media_group" USING btree ("media_id","group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media_user__media_id_idx" ON "cache_media_user" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_per_user_per_media_idx" ON "cache_media_user" USING btree ("media_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "child_group_names_unique_idx" ON "group" USING btree ("parent_id","name");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cache_media_file" ADD CONSTRAINT "cache_media_file_media_id_cache_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."cache_media"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finder_query_execution" ADD CONSTRAINT "finder_query_execution_query_id_finder_query_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."finder_query"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "finder_query_execution_media_content" DROP COLUMN IF EXISTS "id";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media_content" ADD PRIMARY KEY ("content_hash");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finder_query_execution_media" ADD CONSTRAINT "finder_query_execution_media_content_hash_finder_query_execution_media_content_content_hash_fk" FOREIGN KEY ("content_hash") REFERENCES "public"."finder_query_execution_media_content"("content_hash") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finder_query_execution_media" ADD CONSTRAINT "finder_query_execution_media_query_execution_id_finder_query_execution_id_fk" FOREIGN KEY ("query_execution_id") REFERENCES "public"."finder_query_execution"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cache_media_source" ADD CONSTRAINT "cache_media_source_cache_media_id_cache_media_id_fk" FOREIGN KEY ("cache_media_id") REFERENCES "public"."cache_media"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media_file__media_id_idx" ON "cache_media_file" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cache_media_file__unique_per_finder_media_file_type_idx" ON "cache_media_file" USING btree ("finder_source_id","finder_media_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media_id_idx" ON "cache_media_source" USING btree ("cache_media_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_per_source_idx" ON "cache_media_source" USING btree ("finder_source_id","cache_media_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_per_finder_media_idx_key" ON "cache_media_source" USING btree ("finder_source_id","finder_media_id");--> statement-breakpoint
ALTER TABLE "cache_media" DROP COLUMN IF EXISTS "fileHash";--> statement-breakpoint
ALTER TABLE "cache_media" DROP COLUMN IF EXISTS "draft";--> statement-breakpoint
ALTER TABLE "finder_query_execution" DROP COLUMN IF EXISTS "createdAt";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media_content" DROP COLUMN IF EXISTS "itemType";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media" DROP COLUMN IF EXISTS "itemType";--> statement-breakpoint
ALTER TABLE "merged_cache_media" DROP COLUMN IF EXISTS "createdAt";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media_content" ADD CONSTRAINT "finder_query_execution_media_content_content_unique" UNIQUE("content");--> statement-breakpoint
ALTER TABLE "merged_cache_media" ADD CONSTRAINT "merged_cache_media_original_media_id_unique" UNIQUE("original_media_id");--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_finder_source_id_unique" UNIQUE("finder_source_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cache_media_source" ADD CONSTRAINT "cache_media_source_finder_source_id_source_finder_source_id_fk" FOREIGN KEY ("finder_source_id") REFERENCES "public"."source"("finder_source_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;