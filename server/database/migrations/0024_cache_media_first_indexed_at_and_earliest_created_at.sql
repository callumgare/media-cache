ALTER TABLE "cache_media" RENAME COLUMN "created_at" TO "first_indexed_at";--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "earliest_created_at" timestamp (3);