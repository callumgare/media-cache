CREATE TYPE "public"."video_start_position" AS ENUM('start', 'random');
ALTER TABLE "user_preferences" ADD COLUMN "video_start_position" "video_start_position" DEFAULT 'start' NOT NULL;