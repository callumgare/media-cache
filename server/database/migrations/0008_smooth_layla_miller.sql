CREATE TABLE IF NOT EXISTS "finder_query_execution_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"execution_id" integer NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb
);
--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "media_found" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "media_new" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "media_updated" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "media_removed" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "media_not_suitable" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "media_unchanged" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "page_count" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ADD COLUMN "status" text DEFAULT 'running' NOT NULL;--> statement-breakpoint
UPDATE "finder_query_execution" SET "status" = 'completed';--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "finder_query_execution_log" ADD CONSTRAINT "finder_query_execution_log_execution_id_finder_query_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."finder_query_execution"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
