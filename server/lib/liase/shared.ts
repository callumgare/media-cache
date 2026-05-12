import type { GenericFile } from "@liase/core";

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
  urlRefreshDetails: NonNullable<GenericFile["urlRefreshDetails"]> | null;
  urlUpdatedAt: Date;
};

export function liaseFileToCacheFile(liaseFile: GenericFile): CacheFileResult {
  let urlExpires = null;
  if (liaseFile.urlExpires instanceof Date) {
    urlExpires = liaseFile.urlExpires;
  } else if (liaseFile.urlExpires === true) {
    // If url expires but no specific date is given set the expiry to 30 minutes from now
    urlExpires = new Date(Date.now() + 30 * 60 * 1000);
  }

  return {
    type: liaseFile.type,
    url: liaseFile.url,
    ext: liaseFile.ext ?? null,
    mimeType: liaseFile.mimeType ?? null,
    hasVideo: liaseFile.video ?? null,
    hasAudio: liaseFile.audio ?? null,
    hasImage: liaseFile.image ?? null,
    duration: liaseFile.duration ?? null,
    fileSize: liaseFile.fileSize ?? null,
    width: liaseFile.width ?? null,
    height: liaseFile.height ?? null,
    urlExpires,
    urlRefreshDetails: liaseFile.urlRefreshDetails ?? null,
    urlUpdatedAt: new Date(),
  };
}
