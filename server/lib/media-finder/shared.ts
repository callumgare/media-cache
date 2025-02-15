import type { GenericFile } from 'media-finder'
import type { dbSchema } from '#imports'
import { serialize } from '~/server/lib/general'

type Result = Omit<dbSchema.CacheMediaFile, 'finderSourceId' | 'finderMediaId' | 'media' | 'updatedAt' | 'id' | 'createdAt' | 'mediaId'>

export function finderFileToCacheFile(finderFile: GenericFile): Result {
  let urlExpires = null
  if (finderFile.urlExpires instanceof Date) {
    urlExpires = finderFile.urlExpires
  }
  else if (finderFile.urlExpires === true) {
    // If url expires but no specific date is given set the expiry to 30 minutes from now
    urlExpires = new Date(Date.now() + (30 * 60 * 1000))
  }

  return {
    type: finderFile.type,
    url: finderFile.url,
    ext: finderFile.ext ?? null,
    mimeType: finderFile.mimeType ?? null,
    hasVideo: finderFile.video ?? null,
    hasAudio: finderFile.audio ?? null,
    hasImage: finderFile.image ?? null,
    duration: finderFile.duration ?? null,
    fileSize: finderFile.fileSize ?? null,
    width: finderFile.width ?? null,
    height: finderFile.height ?? null,
    urlExpires,
    urlRefreshDetails: finderFile.urlRefreshDetails ? serialize(finderFile.urlRefreshDetails) : null,
  }
}
