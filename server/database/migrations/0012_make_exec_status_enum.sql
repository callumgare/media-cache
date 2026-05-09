CREATE TYPE status AS ENUM ('running', 'completed', 'failed');
ALTER TABLE "finder_query_execution" DROP COLUMN "status";
ALTER TABLE "finder_query_execution" ADD COLUMN "status" "public"."status" NOT NULL;