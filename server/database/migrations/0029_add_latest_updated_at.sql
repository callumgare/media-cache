ALTER TABLE "cache_media" RENAME COLUMN "updated_at" TO "last_indexed_at";--> statement-breakpoint
DROP INDEX "cache_media__updated_at_idx";--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "latest_updated_at" timestamp (3);--> statement-breakpoint
CREATE INDEX "cache_media__last_indexed_at_idx" ON "cache_media" USING btree ("last_indexed_at");--> statement-breakpoint
CREATE INDEX "cache_media__latest_updated_at_idx" ON "cache_media" USING btree ("latest_updated_at");