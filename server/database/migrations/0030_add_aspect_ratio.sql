ALTER TABLE "cache_media" ADD COLUMN "aspect_ratio" double precision;--> statement-breakpoint
CREATE INDEX "cache_media__aspect_ratio_idx" ON "cache_media" USING btree ("aspect_ratio");--> statement-breakpoint
CREATE INDEX "cache_media__earliest_created_at_idx" ON "cache_media" USING btree ("earliest_created_at");--> statement-breakpoint
CREATE INDEX "cache_media__earliest_uploaded_at_idx" ON "cache_media" USING btree ("earliest_uploaded_at");