ALTER TABLE "liase_query_media" RENAME COLUMN "query_execution_id" TO "query_execution_id_created_on";--> statement-breakpoint
ALTER TABLE "liase_query_media" DROP CONSTRAINT "liase_query_media_query_execution_id_liase_query_execution_id_fk";
--> statement-breakpoint
ALTER TABLE "liase_query_media" ADD COLUMN "found_in_latest_execution" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "liase_query_media" ADD CONSTRAINT "liase_query_media_query_execution_id_created_on_liase_query_execution_id_fk" FOREIGN KEY ("query_execution_id_created_on") REFERENCES "public"."liase_query_execution"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DELETE FROM "liase_query_media"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY content_hash, query_id
             ORDER BY query_execution_id_created_on DESC NULLS LAST
           ) AS rn
    FROM "liase_query_media"
  ) ranked
  WHERE rn > 1
);--> statement-breakpoint
ALTER TABLE "liase_query_media" ADD CONSTRAINT "liase_query_media__content_hash_query_id_unique" UNIQUE("content_hash","query_id");