-- Drop old btree indexes on 2D array columns
DROP INDEX "cache_media__finder_source_media_ids_idx";--> statement-breakpoint
DROP INDEX "cache_media__group_ids_idx";--> statement-breakpoint
DROP INDEX "cache_media__original_group_ids_idx";--> statement-breakpoint

-- Add new columns so data-migration UPDATEs below can populate them.
-- group_ids_new / original_group_ids_new are temp names because ALTER COLUMN ... USING
-- does not allow subqueries; we'll drop the old integer[2][] columns and rename.
ALTER TABLE "cache_media" ADD COLUMN "finder_source_ids"      text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "group_ids_new"          text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "original_group_ids_new" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "group_paths"            text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "cache_media" ADD COLUMN "original_group_paths"   text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint

-- Populate finder_source_ids: distinct source names extracted from the 2D finder_source_media_ids
-- Old format: text[2][] where [i][1]=sourceId, [i][2]=mediaId
UPDATE "cache_media"
SET finder_source_ids = ARRAY(
  SELECT DISTINCT "finder_source_media_ids"[i][1]
  FROM generate_subscripts("finder_source_media_ids", 1) AS i
);--> statement-breakpoint

-- Transform finder_source_media_ids in-place: 2D {sourceId,mediaId} pairs → 1D 'sourceId<TAB>mediaId'
-- (text[][] and text[] share the same type OID in PostgreSQL, so UPDATE + trivial re-declaration works)
UPDATE "cache_media"
SET finder_source_media_ids = ARRAY(
  SELECT "finder_source_media_ids"[i][1] || chr(9) || "finder_source_media_ids"[i][2]
  FROM generate_subscripts("finder_source_media_ids", 1) AS i
);--> statement-breakpoint

-- Re-declare finder_source_media_ids as 1D text[] (data already is 1D; same type OID, trivial cast)
ALTER TABLE "cache_media" ALTER COLUMN "finder_source_media_ids" SET DATA TYPE text[];--> statement-breakpoint
ALTER TABLE "cache_media" ALTER COLUMN "finder_source_media_ids" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint

-- group_ids: integer[2][] → text[]; extract [i][1] (groupId), discard [i][2] (parentId)
-- Must use UPDATE + drop/rename because ALTER COLUMN ... USING forbids subqueries.
UPDATE "cache_media"
SET group_ids_new = ARRAY(
  SELECT "group_ids"[i][1]::text
  FROM generate_subscripts("group_ids", 1) AS i
);--> statement-breakpoint

-- original_group_ids: same transformation
UPDATE "cache_media"
SET original_group_ids_new = ARRAY(
  SELECT "original_group_ids"[i][1]::text
  FROM generate_subscripts("original_group_ids", 1) AS i
);--> statement-breakpoint

-- Swap out old integer[2][] columns for the new text[] ones
ALTER TABLE "cache_media" DROP COLUMN "group_ids";--> statement-breakpoint
ALTER TABLE "cache_media" DROP COLUMN "original_group_ids";--> statement-breakpoint
ALTER TABLE "cache_media" RENAME COLUMN "group_ids_new" TO "group_ids";--> statement-breakpoint
ALTER TABLE "cache_media" RENAME COLUMN "original_group_ids_new" TO "original_group_ids";--> statement-breakpoint

-- Populate group_paths: leaf→root ancestor path for every group_id on each media row
-- e.g. group 42 (parent 15, grandparent 3) → '42<TAB>15<TAB>3<TAB>'
WITH RECURSIVE group_ancestors AS (
  SELECT id AS leaf_id, id::text || chr(9) AS path, parent_id
  FROM "group"
  UNION ALL
  SELECT ga.leaf_id, ga.path || p.id::text || chr(9), p.parent_id
  FROM group_ancestors ga
  JOIN "group" p ON p.id = ga.parent_id
  WHERE ga.parent_id IS NOT NULL
),
group_full_path AS (
  SELECT DISTINCT ON (leaf_id) leaf_id, path
  FROM group_ancestors
  ORDER BY leaf_id, length(path) DESC
)
UPDATE "cache_media" cm
SET group_paths = COALESCE(
  ARRAY(
    SELECT gfp.path
    FROM unnest(cm.group_ids) AS gid
    JOIN group_full_path gfp ON gfp.leaf_id = gid::int
  ),
  ARRAY[]::text[]
);--> statement-breakpoint

-- Populate original_group_paths: same for original_group_ids
WITH RECURSIVE group_ancestors AS (
  SELECT id AS leaf_id, id::text || chr(9) AS path, parent_id
  FROM "group"
  UNION ALL
  SELECT ga.leaf_id, ga.path || p.id::text || chr(9), p.parent_id
  FROM group_ancestors ga
  JOIN "group" p ON p.id = ga.parent_id
  WHERE ga.parent_id IS NOT NULL
),
group_full_path AS (
  SELECT DISTINCT ON (leaf_id) leaf_id, path
  FROM group_ancestors
  ORDER BY leaf_id, length(path) DESC
)
UPDATE "cache_media" cm
SET original_group_paths = COALESCE(
  ARRAY(
    SELECT gfp.path
    FROM unnest(cm.original_group_ids) AS gid
    JOIN group_full_path gfp ON gfp.leaf_id = gid::int
  ),
  ARRAY[]::text[]
);--> statement-breakpoint

-- GIN indexes for fast @> containment queries
CREATE INDEX "cache_media__finder_source_ids_gin_idx" ON "cache_media" USING gin ("finder_source_ids");--> statement-breakpoint
CREATE INDEX "cache_media__finder_source_media_ids_gin_idx" ON "cache_media" USING gin ("finder_source_media_ids");--> statement-breakpoint
CREATE INDEX "cache_media__group_ids_gin_idx" ON "cache_media" USING gin ("group_ids");--> statement-breakpoint
CREATE INDEX "cache_media__original_group_ids_gin_idx" ON "cache_media" USING gin ("original_group_ids");--> statement-breakpoint
CREATE INDEX "cache_media__group_paths_gin_idx" ON "cache_media" USING gin ("group_paths");--> statement-breakpoint
CREATE INDEX "cache_media__original_group_paths_gin_idx" ON "cache_media" USING gin ("original_group_paths");--> statement-breakpoint

-- Covering btree index enables index-only scans for facet aggregation queries,
-- avoiding full heap reads (~2.9 GB). Drizzle v0.45 has no .include() support.
CREATE INDEX "cache_media__facets_covering_idx"
  ON "cache_media" (id)
  INCLUDE (finder_source_ids, finder_source_media_ids, group_ids, has_video, has_audio, has_image);