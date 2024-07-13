-- AlterTable
ALTER TABLE "File" ADD COLUMN     "urlExpires" TIMESTAMP(3),
ADD COLUMN     "urlRefreshDetails" JSONB;
