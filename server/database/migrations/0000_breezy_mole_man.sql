CREATE TABLE IF NOT EXISTS "File" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"mediaId" integer NOT NULL,
	"finderSourceId" text NOT NULL,
	"finderMediaId" text NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"ext" text,
	"mimeType" text,
	"hasVideo" boolean,
	"hasAudio" boolean,
	"hasImage" boolean,
	"duration" double precision,
	"fileSize" integer,
	"width" integer,
	"height" integer,
	"urlExpires" timestamp (3),
	"urlRefreshDetails" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Group" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "GroupEntry" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"parentId" integer,
	"groupId" integer,
	"groupName" text,
	"mediaId" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Media" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"title" text,
	"description" text,
	"fileHash" text,
	"draft" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MediaFinderHistory" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"startDate" timestamp (3) NOT NULL,
	"endDate" timestamp (3) NOT NULL,
	"found" integer NOT NULL,
	"new" integer NOT NULL,
	"updated" integer NOT NULL,
	"removed" integer NOT NULL,
	"notSuitable" integer NOT NULL,
	"unchanged" integer NOT NULL,
	"warningCount" integer NOT NULL,
	"nonFatalErrorCount" integer NOT NULL,
	"fatalErrorCount" integer NOT NULL,
	"queryId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MediaFinderQuery" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"title" text NOT NULL,
	"requestOptions" text NOT NULL,
	"schedule" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MediaFinderResponseItemContent" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"source" text NOT NULL,
	"itemId" text NOT NULL,
	"itemType" text NOT NULL,
	"content" text NOT NULL,
	"contentHash" text NOT NULL,
	CONSTRAINT "MediaFinderResponseItemContent_content_unique" UNIQUE("content"),
	CONSTRAINT "MediaFinderResponseItemContent_contentHash_unique" UNIQUE("contentHash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MediaFinderResponseItemMap" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"source" text NOT NULL,
	"itemId" text NOT NULL,
	"itemType" text NOT NULL,
	"contentHash" text NOT NULL,
	"queryHistoryId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MediaFinderSettings" (
	"key" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MergedMediaIndex" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"currentMediaId" integer NOT NULL,
	"originalMediaId" integer NOT NULL,
	CONSTRAINT "MergedMediaIndex_originalMediaId_unique" UNIQUE("originalMediaId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Source" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"finderSourceId" text NOT NULL,
	CONSTRAINT "Source_finderSourceId_unique" UNIQUE("finderSourceId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SourceMediaDetails" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"sourceUploadedAt" timestamp (3),
	"title" text,
	"description" text,
	"url" text,
	"creator" text,
	"uploader" text,
	"views" integer,
	"likes" integer,
	"likesPercentage" double precision,
	"dislikes" integer,
	"finderSourceId" text NOT NULL,
	"finderMediaId" text NOT NULL,
	"mediaId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "User" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	"username" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "File" ADD CONSTRAINT "File_mediaId_Media_id_fk" FOREIGN KEY ("mediaId") REFERENCES "public"."Media"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "GroupEntry" ADD CONSTRAINT "GroupEntry_parentId_GroupEntry_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."GroupEntry"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "GroupEntry" ADD CONSTRAINT "GroupEntry_groupId_Group_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "GroupEntry" ADD CONSTRAINT "GroupEntry_mediaId_Media_id_fk" FOREIGN KEY ("mediaId") REFERENCES "public"."Media"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MediaFinderHistory" ADD CONSTRAINT "MediaFinderHistory_queryId_MediaFinderQuery_id_fk" FOREIGN KEY ("queryId") REFERENCES "public"."MediaFinderQuery"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MediaFinderResponseItemMap" ADD CONSTRAINT "MediaFinderResponseItemMap_contentHash_MediaFinderResponseItemContent_contentHash_fk" FOREIGN KEY ("contentHash") REFERENCES "public"."MediaFinderResponseItemContent"("contentHash") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MediaFinderResponseItemMap" ADD CONSTRAINT "MediaFinderResponseItemMap_queryHistoryId_MediaFinderHistory_id_fk" FOREIGN KEY ("queryHistoryId") REFERENCES "public"."MediaFinderHistory"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SourceMediaDetails" ADD CONSTRAINT "SourceMediaDetails_finderSourceId_Source_finderSourceId_fk" FOREIGN KEY ("finderSourceId") REFERENCES "public"."Source"("finderSourceId") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "SourceMediaDetails" ADD CONSTRAINT "SourceMediaDetails_mediaId_Media_id_fk" FOREIGN KEY ("mediaId") REFERENCES "public"."Media"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "File_finderSourceId_finderMediaId_type_key" ON "File" USING btree ("finderSourceId","finderMediaId","type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "GroupEntry_parentId_groupId_mediaId_key" ON "GroupEntry" USING btree ("parentId","groupId","mediaId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "GroupEntry_parentId_mediaId_groupName_key" ON "GroupEntry" USING btree ("parentId","mediaId","groupName");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SourceMediaDetails_finderSourceId_mediaId_key" ON "SourceMediaDetails" USING btree ("finderSourceId","mediaId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "SourceMediaDetails_finderSourceId_finderMediaId_key" ON "SourceMediaDetails" USING btree ("finderSourceId","finderMediaId");