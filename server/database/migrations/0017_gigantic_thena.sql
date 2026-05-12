-- Rename tables: finder_query* → liase_query*
ALTER TABLE "finder_query" RENAME TO "liase_query";
--> statement-breakpoint
ALTER TABLE "finder_query_execution" RENAME TO "liase_query_execution";
--> statement-breakpoint
ALTER TABLE "finder_query_execution_log" RENAME TO "liase_query_execution_log";
--> statement-breakpoint
ALTER TABLE "finder_query_media" RENAME TO "liase_query_media";
--> statement-breakpoint
ALTER TABLE "finder_query_media_content" RENAME TO "liase_query_media_content";
--> statement-breakpoint

-- Rename FK constraints on liase_query_execution
ALTER TABLE "liase_query_execution" RENAME CONSTRAINT "finder_query_execution_query_id_finder_query_id_fk" TO "liase_query_execution_query_id_liase_query_id_fk";
--> statement-breakpoint

-- Rename FK constraints on liase_query_execution_log
ALTER TABLE "liase_query_execution_log" RENAME CONSTRAINT "finder_query_execution_log_execution_id_finder_query_execution_id_fk" TO "liase_query_execution_log_execution_id_liase_query_execution_id_fk";
--> statement-breakpoint

-- Rename FK constraints on liase_query_media
ALTER TABLE "liase_query_media" RENAME CONSTRAINT "finder_query_media_content_hash_finder_query_media_content_content_hash_fk" TO "liase_query_media_content_hash_liase_query_media_content_content_hash_fk";
--> statement-breakpoint
ALTER TABLE "liase_query_media" RENAME CONSTRAINT "finder_query_media_query_execution_id_finder_query_execution_id_fk" TO "liase_query_media_query_execution_id_liase_query_execution_id_fk";
--> statement-breakpoint
ALTER TABLE "liase_query_media" RENAME CONSTRAINT "finder_query_media_query_id_finder_query_id_fk" TO "liase_query_media_query_id_liase_query_id_fk";
--> statement-breakpoint

-- Rename finder_id → liase_id in liase_query_media and liase_query_media_content
ALTER TABLE "liase_query_media" RENAME COLUMN "finder_id" TO "liase_id";
--> statement-breakpoint
ALTER TABLE "liase_query_media_content" RENAME COLUMN "finder_id" TO "liase_id";
--> statement-breakpoint

-- Rename finder_source_id → liase_source_id in source, and update its unique constraint
ALTER TABLE "source" DROP CONSTRAINT "source_finder_source_id_unique";
--> statement-breakpoint
ALTER TABLE "source" RENAME COLUMN "finder_source_id" TO "liase_source_id";
--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_liase_source_id_unique" UNIQUE("liase_source_id");
--> statement-breakpoint

-- Rename finder_source_ids → liase_source_ids and finder_ids → liase_ids in cache_media
DROP INDEX "cache_media__finder_source_ids_gin_idx";
--> statement-breakpoint
DROP INDEX "cache_media__finder_ids_gin_idx";
--> statement-breakpoint
ALTER TABLE "cache_media" RENAME COLUMN "finder_source_ids" TO "liase_source_ids";
--> statement-breakpoint
ALTER TABLE "cache_media" RENAME COLUMN "finder_ids" TO "liase_ids";
--> statement-breakpoint
CREATE INDEX "cache_media__liase_source_ids_gin_idx" ON "cache_media" USING gin ("liase_source_ids");
--> statement-breakpoint
CREATE INDEX "cache_media__liase_ids_gin_idx" ON "cache_media" USING gin ("liase_ids");
--> statement-breakpoint

-- Migrate JSONB keys: finderSourceId → liaseSourceId, finderMediaId → liaseMediaId in cache_media.files
UPDATE "cache_media"
SET "files" = (
  SELECT jsonb_agg(
    (elem - 'finderSourceId' - 'finderMediaId')
    || CASE WHEN elem ? 'finderSourceId' THEN jsonb_build_object('liaseSourceId', elem -> 'finderSourceId') ELSE '{}'::jsonb END
    || CASE WHEN elem ? 'finderMediaId' THEN jsonb_build_object('liaseMediaId', elem -> 'finderMediaId') ELSE '{}'::jsonb END
  )
  FROM jsonb_array_elements("files") elem
)
WHERE "files" IS NOT NULL
  AND "files"::text LIKE '%finderSourceId%';
--> statement-breakpoint

-- Migrate JSONB keys: finderSourceId → liaseSourceId, finderMediaId → liaseMediaId in cache_media.sources
UPDATE "cache_media"
SET "sources" = (
  SELECT jsonb_agg(
    (elem - 'finderSourceId' - 'finderMediaId')
    || CASE WHEN elem ? 'finderSourceId' THEN jsonb_build_object('liaseSourceId', elem -> 'finderSourceId') ELSE '{}'::jsonb END
    || CASE WHEN elem ? 'finderMediaId' THEN jsonb_build_object('liaseMediaId', elem -> 'finderMediaId') ELSE '{}'::jsonb END
  )
  FROM jsonb_array_elements("sources") elem
)
WHERE "sources" IS NOT NULL
  AND "sources"::text LIKE '%finderSourceId%';

-- Migrate JSONB keys: mediaFinderSource → liaseSource in liase_query_media_content.content
UPDATE liase_query_media_content
SET content = jsonb_set(
  content::jsonb #- '{json,mediaFinderSource}',
  '{json,liaseSource}',
  content::jsonb -> 'json' -> 'mediaFinderSource'
)::text
WHERE jsonb_exists(content::jsonb -> 'json', 'mediaFinderSource');


-- Recreate BM25 index on cache_media with the renamed liase_source_ids column
DROP INDEX "cache_media_bm25_facets";
CREATE INDEX cache_media_bm25_facets ON cache_media
  USING bm25 (id, (liase_source_ids::pdb.literal), (group_ids::pdb.literal))
  WITH (key_field = 'id');