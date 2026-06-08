import { db, dbSchema } from "@@/server/utils/drizzle";
import { eq } from "drizzle-orm";
import { getLiaseQuery } from "../liase";
import { liaseFileToCacheFile } from "./shared";

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
  const mediaQuery = await getLiaseQuery({
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
      f.liaseSourceId !== file.liaseSourceId ||
      f.liaseMediaId !== file.liaseMediaId ||
      f.type !== file.type
    ) {
      return f;
    }

    for (const media of response?.media || []) {
      if (
        media.id !== file.liaseMediaId ||
        media.liaseSource !== file.liaseSourceId
      )
        continue;
      for (const liaseFile of media.files) {
        if (liaseFile.type !== file.type) continue;
        const refreshed = liaseFileToCacheFile(liaseFile);
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
      `Returned media did not contain expected file of type "${file.type}" for media ID ${file.liaseMediaId}`,
    );
  }

  await db
    .update(dbSchema.cacheMedia)
    .set({ files: updatedFiles })
    .where(eq(dbSchema.cacheMedia.id, mediaId));

  return newUrl;
}
