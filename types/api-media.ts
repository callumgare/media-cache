import type { CacheMedia } from "@@/server/database/schema";
import { z } from "zod";

export const APISourceMediaDetails = z.object({
  sourceName: z.string(),
  liaseSourceId: z.string(),
  liaseMediaId: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  url: z.string().nullable(),
  creator: z.string().nullable(),
  uploader: z.string().nullable(),
  views: z.number().nullable(),
  likes: z.number().nullable(),
  dislikes: z.number().nullable(),
  likesPercentage: z.number().nullable(),
  uploadedAt: z.coerce.date().nullable(),
});

export const APIUserMediaDetails = z.object({
  lastViewedOn: z.date().nullable(),
  viewCount: z.number(),
  favourited: z.boolean(),
});

type CacheMediaFile = NonNullable<CacheMedia["files"]>[number];

type APIMediaFileType = Pick<
  CacheMediaFile,
  | "type"
  | "hasVideo"
  | "hasAudio"
  | "hasImage"
  | "fileSize"
  | "width"
  | "height"
  | "ext"
  | "duration"
  | "mimeType"
  | "urlExpires"
  | "urlUpdatedAt"
  | "liaseSourceId"
  | "liaseMediaId"
> & {
  filename: string;
  sourceUrl: string; // renamed from CacheMediaFile['url']
};

export const APIMediaFile = z.object({
  type: z.string(),
  hasVideo: z.boolean().nullable(),
  hasAudio: z.boolean().nullable(),
  hasImage: z.boolean().nullable(),
  fileSize: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  ext: z.string().nullable(),
  filename: z.string(),
  sourceUrl: z.string(),
  duration: z.number().nullable(),
  mimeType: z.string().nullable(),
  urlExpires: z.coerce.date().nullable(),
  urlUpdatedAt: z.coerce.date(),
  liaseSourceId: z.string(),
  liaseMediaId: z.string(),
}) satisfies z.ZodType<APIMediaFileType>;

type APIMediaType = Pick<
  CacheMedia,
  "id" | "title" | "description" | "duration"
> & {
  tags: string[];
  sourceDetails: z.infer<typeof APISourceMediaDetails>[];
  files: z.infer<typeof APIMediaFile>[];
};

export const APIMedia = z.object({
  id: z.number(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  duration: z.number().nullable(),
  firstIndexedAt: z.coerce.date(),
  lastIndexedAt: z.coerce.date(),
  earliestUploadedAt: z.coerce.date().nullable(),
  earliestCreatedAt: z.coerce.date().nullable(),
  latestUpdatedAt: z.coerce.date().nullable(),
  creators: z.array(z.string()),
  uploaders: z.array(z.string()),
  views: z.number().nullable(),
  likes: z.number().nullable(),
  dislikes: z.number().nullable(),
  hasVideo: z.boolean().nullable(),
  hasAudio: z.boolean().nullable(),
  hasImage: z.boolean().nullable(),
  fileSize: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  tags: z.array(z.string()),
  sourceDetails: z.array(APISourceMediaDetails),
  files: z.array(APIMediaFile),
}) satisfies z.ZodType<APIMediaType>;

export type APIMediaData = z.infer<typeof APIMedia>;

export const APIMediaResponse = z.object({
  totalCount: z.number(),
  pageSize: z.number(),
  page: z.number(),
  media: z.array(APIMedia),
  date: z.coerce.date(),
});
