import fs from 'node:fs'
import { updateFileUrl } from '../../../../../lib/media-finder/update-file-url'
import { getPosterOfFile } from '~/server/lib/transcoding/poster'

export default defineEventHandler(async (event): Promise<string | undefined> => {
  const { mediaId: mediaIdString = '', fileId: fileType = '', maxHeight: maxHeightString = '' } = event.context.params || {}
  const reqUrl = getRequestURL(event)
  const mediaId = parseInt(mediaIdString)
  const maxHeight = parseInt(maxHeightString)
  if (isNaN(mediaId)) {
    return 'wrong'
  }

  const cacheMedia = await db.query.cacheMedia.findFirst({
    where: (m, { eq }) => eq(m.id, mediaId),
  })
  if (!cacheMedia) {
    throw Error('Could not fetch media')
  }

  const file = (cacheMedia.files ?? []).find(f => f.type === fileType)
  if (!file) {
    throw Error('Could not fetch file')
  }

  let fileUrl
  if (file.urlExpires && (new Date() > new Date(file.urlExpires))) {
    const refreshedUrl = await updateFileUrl({ mediaId, file })
    fileUrl = new URL(refreshedUrl)
    fileUrl.search = reqUrl.search
  }
  else {
    fileUrl = new URL(file.url)
  }

  const filePath = await getPosterOfFile(fileUrl, mediaId, maxHeight)

  setResponseHeader(event, 'Content-Type', 'image/jpeg')
  return sendStream(event, fs.createReadStream(filePath)) as Promise<undefined>
})
