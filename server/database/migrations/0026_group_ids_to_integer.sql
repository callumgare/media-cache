-- Drop BM25 index before altering column types (it references group_ids)
DROP INDEX IF EXISTS "cache_media_bm25_facets";--> statement-breakpoint
-- Drop defaults first so PostgreSQL doesn't try to cast ARRAY[]::text[] to integer[]
ALTER TABLE "cache_media" ALTER COLUMN "group_ids" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "cache_media" ALTER COLUMN "original_group_ids" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "cache_media" ALTER COLUMN "group_ids" SET DATA TYPE integer[] USING "group_ids"::integer[];--> statement-breakpoint
ALTER TABLE "cache_media" ALTER COLUMN "group_ids" SET DEFAULT ARRAY[]::integer[];--> statement-breakpoint
ALTER TABLE "cache_media" ALTER COLUMN "original_group_ids" SET DATA TYPE integer[] USING "original_group_ids"::integer[];--> statement-breakpoint
ALTER TABLE "cache_media" ALTER COLUMN "original_group_ids" SET DEFAULT ARRAY[]::integer[];--> statement-breakpoint
-- Recreate BM25 index without group_ids: integer[] cannot be indexed by pdb.literal directly;
-- tag facet counts now use unnest(group_ids) GROUP BY via the GIN index instead.
CREATE INDEX cache_media_bm25_facets ON cache_media
  USING bm25 (id, (liase_source_ids::pdb.literal))
  WITH (key_field = 'id');