import fs from 'node:fs'
import { updateFileUrl } from '../../../../../lib/media-finder/update-file-url'
import { getPosterOfFile } from '~/server/lib/transcoding/poster'

export default defineEventHandler(async (event): Promise<string | undefined> => {
  const { fileId: fileIdString = '', maxHeight: maxHeightString = '' } = event.context.params || {}
  const reqUrl = getRequestURL(event)
  const fileId = parseInt(fileIdString)
  const maxHeight = parseInt(maxHeightString)
  if (isNaN(fileId)) {
    return 'wrong'
  }
  const file = await db.query.cacheMediaFile.findFirst({
    where: (cacheMediaFile, { eq }) => eq(cacheMediaFile.id, fileId),
  })
  if (!file) {
    throw Error('Could not fetch file')
  }

  let fileUrl
  if (file.urlExpires && (new Date() > file.urlExpires)) {
    const refreshedUrl = await updateFileUrl(file)
    fileUrl = new URL(refreshedUrl)
    fileUrl.search = reqUrl.search
  }
  else {
    fileUrl = new URL(file.url)
  }

  const filePath = await getPosterOfFile(fileUrl, fileId, maxHeight)

  setResponseHeader(event, 'Content-Type', 'image/jpeg')
  return sendStream(event, fs.createReadStream(filePath)) as Promise<undefined>
})
