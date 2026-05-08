import fs from "node:fs/promises";
import type { FfmpegCommand } from "fluent-ffmpeg";
import Ffmpeg from "fluent-ffmpeg";

const transcodesInProgress: { [key: string]: Promise<string> } = {};

export async function getPosterOfFile(
  fileUrl: URL,
  fileId: number,
  maxHeight = 0,
): Promise<string> {
  const key = `${fileId}-${maxHeight}`;
  const filePath = `/tmp/${key}.jpg`;
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    // It's okay if poster file doesn't exist, it just means it's not been create yet
  }
  let inProgress = transcodesInProgress[key];
  if (inProgress !== undefined) {
    return inProgress;
  }
  inProgress = new Promise<string>((resolve, reject) => {
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
  }).catch((err) => {
    // Ensure cleanup even if error occurs after callback
    delete transcodesInProgress[key];
    throw err;
  });
  transcodesInProgress[key] = inProgress;
  return inProgress;
}
