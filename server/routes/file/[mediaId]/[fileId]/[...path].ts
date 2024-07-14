import { updateFileUrl } from '../../../../lib/media-finder/update-file-url'

export default defineEventHandler(async (event): Promise<string> => {
  const { fileId: fileIdString = '', path } = event.context.params || {}
  const reqUrl = getRequestURL(event)
  const fileId = parseInt(fileIdString)
  if (isNaN(fileId)) {
    return 'wrong'
  }
  const file = await db.query.File.findFirst({ where: (File, { eq }) => eq(File.id, fileId) })
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

  if (path) {
    const endingPath = '/' + path
    if (!fileUrl.pathname.endsWith('/' + path)) {
      fileUrl.pathname = fileUrl.pathname.replace(/\/[^/]*$/, endingPath)
    }
  }

  return sendProxy(event, fileUrl.href)
})
