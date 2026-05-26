CREATE TABLE "saved_search" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"condition_nodes" jsonb NOT NULL,
	"sort" jsonb NOT NULL,
	"widget_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_search" ADD CONSTRAINT "saved_search_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_search__user_id_name_unique_idx" ON "saved_search" USING btree ("user_id","name");