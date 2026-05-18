ALTER TABLE "liase_query_execution" ADD COLUMN "resume_stage" text;--> statement-breakpoint
ALTER TABLE "liase_query_execution" ADD COLUMN "resume_variation_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "liase_query_execution" ADD COLUMN "resume_page_number" integer;--> statement-breakpoint
ALTER TABLE "liase_query_execution" ADD COLUMN "resume_cursor" jsonb;--> statement-breakpoint
ALTER TABLE "liase_query_execution" ADD COLUMN "resume_pages_fetched" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "liase_query_execution" ADD COLUMN "resume_variation_pages_fetched" integer DEFAULT 0 NOT NULL;