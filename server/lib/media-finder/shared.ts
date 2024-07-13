import type { Prisma } from '@prisma/client'
import { type GenericFile } from 'media-finder'
import { serialize } from '~/lib/general'

type Result = Omit<Prisma.FileCreateInput, 'finderSourceId' | 'finderMediaId' | 'media'>

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
    ext: finderFile.ext,
    mimeType: finderFile.mimeType,
    hasVideo: finderFile.video,
    hasAudio: finderFile.audio,
    hasImage: finderFile.image,
    duration: typeof finderFile.duration === 'number' ? finderFile.duration : undefined, // At the time for writing duration isn't yet a property of media-finder's GenericFile
    fileSize: finderFile.fileSize,
    width: finderFile.width,
    height: finderFile.height,
    urlExpires,
    urlRefreshDetails: finderFile.urlRefreshDetails && serialize(finderFile.urlRefreshDetails),
  }
}
