CREATE INDEX "cache_media__first_indexed_at_idx" ON "cache_media" USING btree ("first_indexed_at");--> statement-breakpoint
CREATE INDEX "cache_media__updated_at_idx" ON "cache_media" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "cache_media__title_idx" ON "cache_media" USING btree ("title");