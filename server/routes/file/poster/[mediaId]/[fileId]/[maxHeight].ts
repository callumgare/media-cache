import fs from "node:fs";
import { updateFileUrl } from "@@/server/lib/media-finder/update-file-url";
import { getPosterOfFile } from "@@/server/lib/transcoding/poster";
import { createError } from "h3";

export default defineEventHandler(
  async (event): Promise<string | undefined> => {
    const {
      mediaId: mediaIdString = "",
      fileId: fileType = "",
      maxHeight: maxHeightString = "",
    } = event.context.params || {};
    const reqUrl = getRequestURL(event);
    const mediaId = Number.parseInt(mediaIdString, 10);
    const maxHeight = Number.parseInt(maxHeightString, 10);
    if (Number.isNaN(mediaId)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid media ID",
      });
    }

    const cacheMedia = await db.query.cacheMedia.findFirst({
      where: (m, { eq }) => eq(m.id, mediaId),
    });
    if (!cacheMedia) {
      throw createError({
        statusCode: 404,
        statusMessage: "Media not found",
      });
    }

    const file = (cacheMedia.files ?? []).find((f) => f.type === fileType);
    if (!file) {
      throw createError({
        statusCode: 404,
        statusMessage: "File not found",
      });
    }

    let fileUrl: URL;
    if (file.urlExpires && new Date() > new Date(file.urlExpires)) {
      const refreshedUrl = await updateFileUrl({ mediaId, file });
      fileUrl = new URL(refreshedUrl);
      fileUrl.search = reqUrl.search;
    } else {
      fileUrl = new URL(file.url);
    }

    const filePath = await getPosterOfFile(fileUrl, mediaId, maxHeight);

    setResponseHeader(event, "Content-Type", "image/jpeg");
    return sendStream(
      event,
      fs.createReadStream(filePath),
    ) as Promise<undefined>;
  },
);
