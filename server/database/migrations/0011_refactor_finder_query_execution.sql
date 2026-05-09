ALTER TABLE "cache_media" RENAME COLUMN "finder_source_media_ids" TO "finder_ids";--> statement-breakpoint
DROP INDEX "cache_media__finder_source_media_ids_gin_idx";--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "finished_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ADD COLUMN "cache_media_created" integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ADD COLUMN "cache_media_updated" integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ADD COLUMN "cache_media_unchanged" integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ADD COLUMN "cache_media_deleted" integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE "finder_query_media" ADD COLUMN "finder_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "finder_query_media_content" ADD COLUMN "finder_id" text NOT NULL;--> statement-breakpoint
CREATE INDEX "cache_media__finder_ids_gin_idx" ON "cache_media" USING gin ("finder_ids");--> statement-breakpoint
ALTER TABLE "finder_query_execution" DROP COLUMN "warning_count";--> statement-breakpoint
ALTER TABLE "finder_query_execution" DROP COLUMN "non_fatal_error_count";--> statement-breakpoint
ALTER TABLE "finder_query_execution" DROP COLUMN "fatal_error_count";--> statement-breakpoint
ALTER TABLE "finder_query_media" DROP COLUMN "finder_source_id";--> statement-breakpoint
ALTER TABLE "finder_query_media" DROP COLUMN "finder_media_id";--> statement-breakpoint
ALTER TABLE "finder_query_media_content" DROP COLUMN "finder_source_id";--> statement-breakpoint
ALTER TABLE "finder_query_media_content" DROP COLUMN "finder_media_id";