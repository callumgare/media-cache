import { db, dbSchema } from "@@/server/utils/drizzle";
import { eq } from "drizzle-orm";
import { getMediaQuery } from "../media-finder";
import { finderFileToCacheFile } from "./shared";

type InlineFile = NonNullable<dbSchema.CacheMedia["files"]>[number];

export async function updateFileUrl({
  mediaId,
  file,
}: {
  mediaId: number;
  file: InlineFile;
}): Promise<string> {
  if (!file.urlRefreshDetails) {
    throw Error("File has no urlRefreshDetails");
  }
  const mediaQuery = await getMediaQuery({
    request: file.urlRefreshDetails,
    queryOptions: {
      fetchCountLimit: 3,
      secrets: { apiKey: process.env.GIPHY_API_KEY },
    },
  });

  const response = await mediaQuery.getNext();
  if (response === null) {
    throw Error("Could not refresh files");
  }

  const cacheMedia = await db.query.cacheMedia.findFirst({
    where: (m, { eq }) => eq(m.id, mediaId),
  });
  if (!cacheMedia) throw Error("Could not find media");

  let newUrl: string | null = null;

  const updatedFiles = (cacheMedia.files ?? []).map((f) => {
    if (
      f.finderSourceId !== file.finderSourceId ||
      f.finderMediaId !== file.finderMediaId ||
      f.type !== file.type
    ) {
      return f;
    }

    for (const media of response?.media || []) {
      if (
        media.id !== file.finderMediaId ||
        media.mediaFinderSource !== file.finderSourceId
      )
        continue;
      for (const finderFile of media.files) {
        if (finderFile.type !== file.type) continue;
        const refreshed = finderFileToCacheFile(finderFile);
        newUrl = refreshed.url;
        return {
          ...f,
          url: refreshed.url,
          urlExpires: refreshed.urlExpires,
          urlRefreshDetails: refreshed.urlRefreshDetails,
          urlUpdatedAt: refreshed.urlUpdatedAt,
          updatedAt: new Date(),
        };
      }
    }
    return f;
  });

  if (!newUrl) {
    throw Error(
      `Returned media did not contain expected file of type "${file.type}" for media ID ${file.finderMediaId}`,
    );
  }

  await db
    .update(dbSchema.cacheMedia)
    .set({ files: updatedFiles, updatedAt: new Date() })
    .where(eq(dbSchema.cacheMedia.id, mediaId));

  return newUrl;
}
