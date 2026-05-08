import { serialize } from "@@/server/lib/general";
import type { GenericFile } from "media-finder";

type CacheFileResult = {
  type: string;
  url: string;
  ext: string | null;
  mimeType: string | null;
  hasVideo: boolean | null;
  hasAudio: boolean | null;
  hasImage: boolean | null;
  duration: number | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  urlExpires: Date | null;
  urlRefreshDetails: string | null;
  urlUpdatedAt: Date;
};

export function finderFileToCacheFile(
  finderFile: GenericFile,
): CacheFileResult {
  let urlExpires = null;
  if (finderFile.urlExpires instanceof Date) {
    urlExpires = finderFile.urlExpires;
  } else if (finderFile.urlExpires === true) {
    // If url expires but no specific date is given set the expiry to 30 minutes from now
    urlExpires = new Date(Date.now() + 30 * 60 * 1000);
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
    urlRefreshDetails: finderFile.urlRefreshDetails
      ? serialize(finderFile.urlRefreshDetails)
      : null,
    urlUpdatedAt: new Date(),
  };
}
