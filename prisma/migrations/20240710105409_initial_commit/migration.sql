-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "fileHash" TEXT,
    "draft" BOOLEAN NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceMediaDetails" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceUploadedAt" TIMESTAMP(3),
    "title" TEXT,
    "description" TEXT,
    "url" TEXT,
    "creator" TEXT,
    "uploader" TEXT,
    "views" INTEGER,
    "likes" INTEGER,
    "likesPercentage" DOUBLE PRECISION,
    "dislikes" INTEGER,
    "finderSourceId" TEXT NOT NULL,
    "finderMediaId" TEXT NOT NULL,
    "mediaId" INTEGER NOT NULL,

    CONSTRAINT "SourceMediaDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mediaId" INTEGER NOT NULL,
    "finderSourceId" TEXT NOT NULL,
    "finderMediaId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ext" TEXT,
    "mimeType" TEXT,
    "hasVideo" BOOLEAN,
    "hasAudio" BOOLEAN,
    "hasImage" BOOLEAN,
    "duration" DOUBLE PRECISION,
    "fileSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finderSourceId" TEXT NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupEntry" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "parentId" INTEGER,
    "groupId" INTEGER,
    "groupName" TEXT,
    "mediaId" INTEGER,

    CONSTRAINT "GroupEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFinderSettings" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "MediaFinderSettings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "MediaFinderQuery" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "requestOptions" JSONB NOT NULL,
    "schedule" INTEGER NOT NULL,

    CONSTRAINT "MediaFinderQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFinderHistory" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "found" INTEGER NOT NULL,
    "new" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "removed" INTEGER NOT NULL,
    "notSuitable" INTEGER NOT NULL,
    "unchanged" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "nonFatalErrorCount" INTEGER NOT NULL,
    "fatalErrorCount" INTEGER NOT NULL,
    "queryId" INTEGER NOT NULL,

    CONSTRAINT "MediaFinderHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFinderResponseItemMap" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "queryHistoryId" INTEGER NOT NULL,

    CONSTRAINT "MediaFinderResponseItemMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFinderResponseItemContent" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "MediaFinderResponseItemContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MergedMediaIndex" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentMediaId" INTEGER NOT NULL,
    "originalMediaId" INTEGER NOT NULL,

    CONSTRAINT "MergedMediaIndex_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceMediaDetails_finderSourceId_mediaId_key" ON "SourceMediaDetails"("finderSourceId", "mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceMediaDetails_finderSourceId_finderMediaId_key" ON "SourceMediaDetails"("finderSourceId", "finderMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "Source_finderSourceId_key" ON "Source"("finderSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupEntry_parentId_groupId_mediaId_key" ON "GroupEntry"("parentId", "groupId", "mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupEntry_parentId_mediaId_groupName_key" ON "GroupEntry"("parentId", "mediaId", "groupName");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFinderResponseItemContent_content_key" ON "MediaFinderResponseItemContent"("content");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFinderResponseItemContent_contentHash_key" ON "MediaFinderResponseItemContent"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "MergedMediaIndex_originalMediaId_key" ON "MergedMediaIndex"("originalMediaId");

-- AddForeignKey
ALTER TABLE "SourceMediaDetails" ADD CONSTRAINT "SourceMediaDetails_finderSourceId_fkey" FOREIGN KEY ("finderSourceId") REFERENCES "Source"("finderSourceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMediaDetails" ADD CONSTRAINT "SourceMediaDetails_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEntry" ADD CONSTRAINT "GroupEntry_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GroupEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEntry" ADD CONSTRAINT "GroupEntry_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEntry" ADD CONSTRAINT "GroupEntry_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFinderHistory" ADD CONSTRAINT "MediaFinderHistory_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "MediaFinderQuery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFinderResponseItemMap" ADD CONSTRAINT "MediaFinderResponseItemMap_contentHash_fkey" FOREIGN KEY ("contentHash") REFERENCES "MediaFinderResponseItemContent"("contentHash") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFinderResponseItemMap" ADD CONSTRAINT "MediaFinderResponseItemMap_queryHistoryId_fkey" FOREIGN KEY ("queryHistoryId") REFERENCES "MediaFinderHistory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
