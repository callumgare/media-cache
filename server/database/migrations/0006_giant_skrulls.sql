CREATE TABLE IF NOT EXISTS "deleted_cache_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"cache_media_id" integer NOT NULL,
	"deletion_reason" text NOT NULL,
	"merged_into_cache_media_id" integer,
	CONSTRAINT "deleted_cache_media_cache_media_id_unique" UNIQUE("cache_media_id")
);
--> statement-breakpoint
DROP TABLE "cache_media_file";--> statement-breakpoint
DROP TABLE "cache_media_group";--> statement-breakpoint
DROP TABLE "cache_media_source";--> statement-breakpoint
DROP TABLE "cache_media_user";--> statement-breakpoint
DROP TABLE "merged_cache_media";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media" RENAME TO "finder_query_media";--> statement-breakpoint
ALTER TABLE "finder_query_execution_media_content" RENAME TO "finder_query_media_content";--> statement-breakpoint
ALTER TABLE "finder_query_media" RENAME COLUMN "source" TO "finder_source_id";--> statement-breakpoint
ALTER TABLE "finder_query_media" RENAME COLUMN "media_id" TO "finder_media_id";--> statement-breakpoint
ALTER TABLE "finder_query_media_content" RENAME COLUMN "source" TO "finder_source_id";--> statement-breakpoint
ALTER TABLE "finder_query_media_content" RENAME COLUMN "media_id" TO "finder_media_id";--> statement-breakpoint
ALTER TABLE "finder_query_media" DROP CONSTRAINT "finder_query_execution_media_content_hash_finder_query_execution_media_content_content_hash_fk";
--> statement-breakpoint
ALTER TABLE "finder_query_media" DROP CONSTRAINT "finder_query_execution_media_query_execution_id_finder_query_execution_id_fk";
--> statement-breakpoint
ALTER TABLE "finder_query_media" ALTER COLUMN "query_execution_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "earliest_uploaded_at" timestamp (3);--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "creators" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "uploaders" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "views" integer;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "likes" integer;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "dislikes" integer;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "finder_source_media_ids" text[2][] DEFAULT ARRAY[]::text[][] NOT NULL;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "group_ids" integer[2][] DEFAULT ARRAY[]::int[][] NOT NULL;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "original_group_ids" integer[2][] DEFAULT ARRAY[]::int[][] NOT NULL;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "has_video" boolean;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "has_audio" boolean;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "has_image" boolean;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "duration" double precision;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "file_size" integer;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "files" jsonb;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "sources" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deleted_cache_media" ADD CONSTRAINT "deleted_cache_media_merged_into_cache_media_id_cache_media_id_fk" FOREIGN KEY ("merged_into_cache_media_id") REFERENCES "public"."cache_media"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finder_query_media" ADD CONSTRAINT "finder_query_media_content_hash_finder_query_media_content_content_hash_fk" FOREIGN KEY ("content_hash") REFERENCES "public"."finder_query_media_content"("content_hash") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finder_query_media" ADD CONSTRAINT "finder_query_media_query_execution_id_finder_query_execution_id_fk" FOREIGN KEY ("query_execution_id") REFERENCES "public"."finder_query_execution"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media__has_video_idx" ON "cache_media" USING btree ("has_video");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media__has_image_idx" ON "cache_media" USING btree ("has_image");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media__has_audio_idx" ON "cache_media" USING btree ("has_audio");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media__duration_idx" ON "cache_media" USING btree ("duration");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media__finder_source_media_ids_idx" ON "cache_media" USING btree ("finder_source_media_ids");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media__group_ids_idx" ON "cache_media" USING btree ("group_ids");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media__original_group_ids_idx" ON "cache_media" USING btree ("original_group_ids");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media__file_size_idx" ON "cache_media" USING btree ("file_size");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media__height_idx" ON "cache_media" USING btree ("height");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cache_media__width_idx" ON "cache_media" USING btree ("width");