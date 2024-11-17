import { z } from 'zod'

export const APISourceMediaDetails = z.object({
  id: z.number(),
  sourceName: z.string(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  creator: z.string().nullable(),
  views: z.number().nullable(),
  likes: z.number().nullable(),
  likesPercentage: z.number().nullable(),
})

export const APIUserMediaDetails = z.object({
  lastViewedOn: z.date().nullable(),
  viewCount: z.number(),
  favourited: z.boolean(),
})

export const APIMediaFile = z.object({
  id: z.number(),
  type: z.string(),
  hasVideo: z.boolean().nullable(),
  hasAudio: z.boolean().nullable(),
  hasImage: z.boolean().nullable(),
  fileSize: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  ext: z.string().nullable(),
  url: z.string(),
})

export const APIMedia = z.object({
  id: z.number(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  sourceDetails: z.array(APISourceMediaDetails),
  files: z.array(APIMediaFile),
})

export const APIMediaResponse = z.object({
  totalCount: z.number(),
  pageSize: z.number(),
  page: z.number(),
  media: z.array(APIMedia),
  date: z.coerce.date(),
})
