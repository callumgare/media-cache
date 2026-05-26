/**
 * Shared test fixture utilities: generates static media files used by both
 * the Playwright e2e global-setup and the Vitest unit tests, and provides a
 * lightweight HTTP file server to serve them.
 */

import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";

export const projectRoot = resolve(import.meta.dirname, "../..");
export const cacheDir = resolve(projectRoot, "tests/.cache");

const MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  m3u8: "application/vnd.apple.mpegurl",
  ts: "video/mp2t",
};

/**
 * Generates tests/.cache/test-video.mp4 via Docker ffmpeg if it doesn't
 * already exist.  Uses a 320×240 animated pattern (testsrc2) with a 440 Hz
 * sine tone, encoded as H.264/AAC, 60 seconds long.
 */
export function ensureTestVideo(): void {
  const testVideoPath = join(cacheDir, "test-video.mp4");
  if (existsSync(testVideoPath)) return;

  console.log("[fixtures] Generating test-video.mp4 via Docker ffmpeg...");
  mkdirSync(cacheDir, { recursive: true });
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${cacheDir}:/output`,
      "jrottenberg/ffmpeg:6.1-alpine",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x240:rate=25:duration=60",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=22050:duration=60",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      "-y",
      "/output/test-video.mp4",
    ],
    { stdio: "pipe" },
  );
  console.log("[fixtures] test-video.mp4 generated.\n");
}

/**
 * Generates tests/.cache/test-image.png (a 200×150 test pattern PNG)
 * via Docker ffmpeg if it doesn't already exist.
 */
export function ensureTestImage(): void {
  const testImagePath = join(cacheDir, "test-image.png");
  if (existsSync(testImagePath)) return;

  console.log("[fixtures] Generating test-image.png via Docker ffmpeg...");
  mkdirSync(cacheDir, { recursive: true });
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${cacheDir}:/output`,
      "jrottenberg/ffmpeg:6.1-alpine",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=200x150:rate=1:duration=1",
      "-frames:v",
      "1",
      "-y",
      "/output/test-image.png",
    ],
    { stdio: "pipe" },
  );
  console.log("[fixtures] test-image.png generated.\n");
}

/**
 * Generates tests/.cache/hls/playlist.m3u8 (and companion seg*.ts files)
 * by remuxing test-video.mp4 into HLS via Docker ffmpeg.
 * Calls ensureTestVideo() first if needed.
 */
export function ensureHlsFixtures(): void {
  ensureTestVideo();
  const hlsDir = join(cacheDir, "hls");
  const playlistPath = join(hlsDir, "playlist.m3u8");
  if (existsSync(playlistPath)) return;

  console.log("[fixtures] Generating HLS fixtures via Docker ffmpeg...");
  mkdirSync(hlsDir, { recursive: true });
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${cacheDir}:/output`,
      "jrottenberg/ffmpeg:6.1-alpine",
      "-i",
      "/output/test-video.mp4",
      "-c:v",
      "copy",
      "-c:a",
      "copy",
      "-hls_time",
      "4",
      "-hls_list_size",
      "0",
      "-hls_segment_filename",
      "/output/hls/seg%d.ts",
      "-y",
      "/output/hls/playlist.m3u8",
    ],
    { stdio: "pipe" },
  );
  console.log("[fixtures] HLS fixtures generated.\n");
}

export interface FileServer {
  /** Base URL of the server, e.g. "http://127.0.0.1:52341" */
  url: string;
  /** Closes the HTTP server. */
  close(): void;
}

/**
 * Starts a local HTTP file server rooted at `dir`.
 * Handles byte-range requests (needed for video seeking) and sets correct
 * MIME types for common media and playlist extensions.
 */
export async function startFileServer(
  dir: string,
  options: { host?: string; publicHost?: string } = {},
): Promise<FileServer> {
  const server = createServer((req, res) => {
    const urlPath = (req.url ?? "/").split("?")[0] ?? "/";
    const filePath = join(dir, urlPath);

    // Prevent path traversal
    if (!filePath.startsWith(`${dir}/`)) {
      res.writeHead(403);
      res.end();
      return;
    }

    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(filePath);
    } catch {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = filePath.split(".").pop() ?? "";
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    const fileSize = stat.size;
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      const start = match?.[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match?.[2] ? Number.parseInt(match[2], 10) : fileSize - 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": contentType,
      });
      createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Accept-Ranges": "bytes",
        "Content-Type": contentType,
      });
      createReadStream(filePath).pipe(res);
    }
  });

  const bindHost = options.host ?? "127.0.0.1";
  await new Promise<void>((resolve) => server.listen(0, bindHost, resolve));

  const port = (server.address() as AddressInfo).port;
  const publicHost = options.publicHost ?? bindHost;
  return {
    url: `http://${publicHost}:${port}`,
    close: () => {
      server.close();
    },
  };
}
