import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async (event): Promise<string> => {
  const { fileId: fileIdString = '', path } = event.context.params || {}
  const reqUrl = getRequestURL(event)
  const fileId = parseInt(fileIdString)
  if (isNaN(fileId)) {
    return 'wrong'
  }
  const file = await prisma.file.findUniqueOrThrow({ where: { id: fileId } })

  const fileUrl = new URL(file.url)
  if (path) {
    const endingPath = '/' + path
    if (!fileUrl.pathname.endsWith('/' + path)) {
      fileUrl.pathname = fileUrl.pathname.replace(/\/[^/]*$/, endingPath)
    }
    fileUrl.search = reqUrl.search
  }

  return sendProxy(event, fileUrl.href)
})
