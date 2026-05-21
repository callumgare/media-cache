import fs from "node:fs/promises";
import { updateFileUrl } from "@@/server/lib/liase/update-file-url";
import type { dbSchema } from "@@/server/utils/drizzle";
import type { FfmpegCommand } from "fluent-ffmpeg";
import Ffmpeg from "fluent-ffmpeg";

type InlineFile = NonNullable<dbSchema.CacheMedia["files"]>[number];

const transcodesInProgress: { [key: string]: Promise<string> } = {};

export async function getPosterOfFile(
  file: InlineFile,
  mediaId: number,
  maxHeight = 0,
): Promise<string> {
  const key = `${mediaId}-${maxHeight}`;
  const filePath = `/tmp/${key}.jpg`;

  // Early check: if transcoding is in flight, return the promise immediately
  // (avoids reading a potentially half-created file below).
  let inProgress = transcodesInProgress[key];
  if (inProgress !== undefined) {
    return inProgress;
  }

  // Check if the poster file already exists (transcoding already completed).
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    // It's okay if poster file doesn't exist, it just means it's not been created yet
  }

  // Re-check after the async fs.access. Concurrent callers that both passed the
  // initial synchronous check will converge here; only the first one proceeds.
  inProgress = transcodesInProgress[key];
  if (inProgress !== undefined) {
    return inProgress;
  }

  inProgress = (async () => {
    // Resolve the file URL, refreshing it if the cached one has expired
    let fileUrl: URL;
    if (file.urlExpires && new Date() > new Date(file.urlExpires)) {
      const refreshedUrl = await updateFileUrl({ mediaId, file });
      fileUrl = new URL(refreshedUrl);
    } else {
      fileUrl = new URL(file.url);
    }

    return new Promise<string>((resolve, reject) => {
      let ffCommand: FfmpegCommand = Ffmpeg();
      ffCommand = ffCommand
        .on("start", (command: string) => {
          console.log("Running ffmpeg command:", command);
        })
        .on("end", (stdout: string | null, stderr: string | null) => {
          if (stderr) console.log(stderr);
          if (stdout) console.log(stdout);
          console.log("Transcoding succeeded !");
          delete transcodesInProgress[key]; // Clean up on success
          resolve(filePath);
        })
        .on(
          "error",
          (err: Error, stdout: string | null, stderr: string | null) => {
            console.error(`Cannot process video: ${err.message}`, err);
            if (stderr) console.error(stderr);
            if (stdout) console.error(stdout);
            delete transcodesInProgress[key]; // Clean up on error
            reject(err);
          },
        )
        .input(fileUrl.href)
        .frames(1)
        .format("image2");
      if (maxHeight) {
        ffCommand = ffCommand.videoFilters(
          `scale='min(iw,iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`,
        );
      }
      ffCommand.save(filePath);
    });
  })().catch((err) => {
    // Ensure cleanup even if error occurs after callback
    delete transcodesInProgress[key];
    throw err;
  });
  transcodesInProgress[key] = inProgress;
  return inProgress;
}
