CREATE TYPE "public"."video_fit" AS ENUM('contain', 'cover');
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) NOT NULL,
	"user_id" integer NOT NULL,
	"loop_video" boolean DEFAULT false NOT NULL,
	"mute_video" boolean DEFAULT true NOT NULL,
	"video_fit" "video_fit" DEFAULT 'cover' NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;