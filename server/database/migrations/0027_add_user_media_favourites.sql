CREATE TABLE "user_cache_media_info" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL,
	"cache_media_id" integer NOT NULL,
	"favourited" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_cache_media_info" ADD CONSTRAINT "user_cache_media_info_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cache_media_info" ADD CONSTRAINT "user_cache_media_info_cache_media_id_cache_media_id_fk" FOREIGN KEY ("cache_media_id") REFERENCES "public"."cache_media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_cache_media_info__user_id_cache_media_id_idx" ON "user_cache_media_info" USING btree ("user_id","cache_media_id");