ALTER TABLE "finder_query_execution" ALTER COLUMN "media_found" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "media_new" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "media_updated" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "media_removed" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "media_not_suitable" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "media_unchanged" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "warning_count" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "non_fatal_error_count" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ALTER COLUMN "fatal_error_count" SET DEFAULT -1;--> statement-breakpoint
ALTER TABLE "finder_query_execution" ADD COLUMN "page_count" integer DEFAULT -1 NOT NULL;