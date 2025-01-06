import { updateFileUrl } from '../../../../lib/media-finder/update-file-url'
import { replaceLast } from '~/lib/string'

import { proxyRequest } from '@/server/lib/proxy'

export default defineEventHandler(async (event) => {
  const { fileId: fileIdString = '' } = event.context.params || {}
  const reqUrl = getRequestURL(event)
  const fileId = parseInt(fileIdString)
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
  }
  else {
    fileUrl = new URL(file.url)
  }
  if (reqUrl.search) {
    fileUrl.search = reqUrl.search
  }

  const basePath = replaceLast(
    // We only want the path but event.path includes the query string if present
    new URL(event.path, 'http://domain.tld').pathname,
    '/' + event.context.matchedRoute?.params?.path,
  )

  const pathParam = event.path.replace(basePath, '')
  const virtualFilename = `media-${event.context.params?.mediaId}-${event.context.params?.fileId}.${file.ext}`
  const upstreamUrl = pathParam === `/${virtualFilename}` ? fileUrl : new URL(pathParam, fileUrl.origin)

  let res = await proxyRequest(event, upstreamUrl)

  if (res.headers.get('content-type') === 'application/vnd.apple.mpegurl') {
    const body = await res.text()
    const makeAddressAbsolute = (address: string) => {
      if (address.startsWith('/')) {
        return address.replace(/^\/\/?/, basePath + '/')
      }
      return basePath + upstreamUrl.pathname.replace(/\/[^/]*$/, '/') + address
    }
    const modifiedBody = body
      .split('\n')
      .map(line => !line || line.startsWith('#') ? line : makeAddressAbsolute(line))
      .join('\n')
    res = new Response(modifiedBody, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  }

  return sendWebResponse(event, res)
})
