CREATE TYPE log_level AS ENUM ('debug', 'info', 'warning', 'error', 'fatal-error');
UPDATE "finder_query_execution_log" SET "level" = 'error' WHERE "level" = 'non_fatal_error';
UPDATE "finder_query_execution_log" SET "level" = 'fatal-error' WHERE "level" = 'fatal_error';
ALTER TABLE "finder_query_execution_log" ALTER COLUMN "level" SET DATA TYPE "public"."log_level" USING "level"::"public"."log_level";