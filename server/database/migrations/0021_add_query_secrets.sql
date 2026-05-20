CREATE TABLE "query_secret" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"label" text NOT NULL,
	"liase_source_id" text NOT NULL,
	"secret_field_name" text NOT NULL,
	"secret_field_type" text NOT NULL,
	"encrypted_value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "liase_query" ADD COLUMN "secret_mappings" jsonb;