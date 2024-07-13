-- AlterTable
ALTER TABLE "File" ALTER COLUMN "urlRefreshDetails" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "MediaFinderQuery" ALTER COLUMN "requestOptions" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "MediaFinderResponseItemContent" ALTER COLUMN "content" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "MediaFinderSettings" ALTER COLUMN "value" SET DATA TYPE TEXT;
