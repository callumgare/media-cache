import type { dbSchema } from "@@/server/utils/drizzle";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type InlineFile = NonNullable<dbSchema.CacheMedia["files"]>[number];

function makeFile(
  url: string,
  overrides: Partial<InlineFile> = {},
): InlineFile {
  return {
    createdAt: new Date(),
    updatedAt: new Date(),
    liaseSourceId: "test-source",
    liaseMediaId: "test-media",
    type: "main",
    url,
    ext: "mp4",
    mimeType: "video/mp4",
    hasVideo: true,
    hasAudio: false,
    hasImage: false,
    duration: null,
    fileSize: null,
    width: null,
    height: null,
    urlExpires: null,
    urlRefreshDetails: null,
    urlUpdatedAt: new Date(),
    ...overrides,
  };
}

// Hoist mock state so it's available inside vi.mock factory callbacks.
// Each call to Ffmpeg() enqueues a proxy into endCbQueue that closes over
// that specific instance's end-callback. triggerFfmpegEnd() pops and fires
// the oldest pending one, matching the order ffmpeg was invoked.
const { ffmpegMock, triggerFfmpegEnd, resetFfmpegState } = vi.hoisted(() => {
  let endCbQueue: Array<() => void> = [];

  const ffmpegMock = vi.fn(() => {
    // Each invocation gets its own endCb captured in a local closure
    let endCb: ((stdout: null, stderr: null) => void) | null = null;
    endCbQueue.push(() => endCb?.(null, null));

    const cmd: Record<string, (...args: unknown[]) => unknown> = {
      on(event: unknown, cb: unknown) {
        if (event === "end") endCb = cb as typeof endCb;
        return cmd;
      },
      input() {
        return cmd;
      },
      frames() {
        return cmd;
      },
      format() {
        return cmd;
      },
      videoFilters() {
        return cmd;
      },
      save() {},
    };
    return cmd;
  });

  const triggerFfmpegEnd = () => endCbQueue.shift()?.();
  const resetFfmpegState = () => {
    endCbQueue = [];
  };

  return { ffmpegMock, triggerFfmpegEnd, resetFfmpegState };
});

vi.mock("node:fs/promises", () => ({
  default: {
    access: vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      ),
  },
  access: vi
    .fn()
    .mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
}));

vi.mock("fluent-ffmpeg", () => ({ default: ffmpegMock }));

vi.mock("@@/server/lib/liase/update-file-url", () => ({
  updateFileUrl: vi.fn().mockResolvedValue("http://example.com/refreshed.mp4"),
}));

// Import after mocks are in place
const { getPosterOfFile } = await import("@@/server/lib/transcoding/poster");
const { updateFileUrl } = await import("@@/server/lib/liase/update-file-url");

// Yield enough microtask ticks to let both concurrent calls pass the
// fs.access check and set up (or reuse) the ffmpeg command.
async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("getPosterOfFile", () => {
  beforeEach(() => {
    ffmpegMock.mockClear();
    resetFfmpegState();
    vi.mocked(updateFileUrl).mockClear();
  });

  describe("in-flight deduplication", () => {
    it("concurrent calls for the same file use a single ffmpeg invocation", async () => {
      const file = makeFile("http://example.com/video.mp4");

      // Start two concurrent calls without awaiting either
      const p1 = getPosterOfFile(file, 1001, 300);
      const p2 = getPosterOfFile(file, 1001, 300);

      // Let both pass the fs.access check so the ffmpeg command is set up
      await flushMicrotasks();

      expect(ffmpegMock).toHaveBeenCalledTimes(1);

      // Resolve the single ffmpeg job
      triggerFfmpegEnd();

      const [path1, path2] = await Promise.all([p1, p2]);
      expect(path1).toBe("/tmp/1001-300.jpg");
      expect(path2).toBe("/tmp/1001-300.jpg");
    });

    it("a third concurrent call also reuses the in-flight promise", async () => {
      const file = makeFile("http://example.com/video.mp4");

      const p1 = getPosterOfFile(file, 1002, 150);
      const p2 = getPosterOfFile(file, 1002, 150);
      const p3 = getPosterOfFile(file, 1002, 150);

      await flushMicrotasks();

      expect(ffmpegMock).toHaveBeenCalledTimes(1);

      triggerFfmpegEnd();

      const paths = await Promise.all([p1, p2, p3]);
      expect(new Set(paths).size).toBe(1);
      expect(paths[0]).toBe("/tmp/1002-150.jpg");
    });

    it("calls with different ids do NOT share the in-flight promise", async () => {
      const file1 = makeFile("http://example.com/a.mp4");
      const file2 = makeFile("http://example.com/b.mp4");

      const p1 = getPosterOfFile(file1, 2001, 300);
      const p2 = getPosterOfFile(file2, 2002, 300);

      await flushMicrotasks();

      expect(ffmpegMock).toHaveBeenCalledTimes(2);

      // Trigger end twice since two ffmpeg instances were started
      triggerFfmpegEnd();
      triggerFfmpegEnd();

      const [path1, path2] = await Promise.all([p1, p2]);
      expect(path1).toBe("/tmp/2001-300.jpg");
      expect(path2).toBe("/tmp/2002-300.jpg");
    });

    it("calls with the same id but different maxHeight do NOT share the in-flight promise", async () => {
      const file = makeFile("http://example.com/video.mp4");

      const p1 = getPosterOfFile(file, 3001, 300);
      const p2 = getPosterOfFile(file, 3001, 150);

      await flushMicrotasks();

      expect(ffmpegMock).toHaveBeenCalledTimes(2);

      triggerFfmpegEnd();
      triggerFfmpegEnd();

      const [path1, path2] = await Promise.all([p1, p2]);
      expect(path1).toBe("/tmp/3001-300.jpg");
      expect(path2).toBe("/tmp/3001-150.jpg");
    });

    it("a call after the previous one has settled starts a fresh ffmpeg invocation", async () => {
      const file = makeFile("http://example.com/video.mp4");

      const p1 = getPosterOfFile(file, 4001, 300);
      await flushMicrotasks();
      triggerFfmpegEnd();
      await p1;

      // First call done; ffmpegMock called once so far
      expect(ffmpegMock).toHaveBeenCalledTimes(1);

      // Second call after completion — fs.access still throws so a new
      // ffmpeg invocation should be started
      const p2 = getPosterOfFile(file, 4001, 300);
      await flushMicrotasks();
      expect(ffmpegMock).toHaveBeenCalledTimes(2);

      triggerFfmpegEnd();
      await p2;
    });
  });

  describe("URL refresh", () => {
    it("uses the file url directly when urlExpires is null", async () => {
      const file = makeFile("http://example.com/original.mp4", {
        urlExpires: null,
      });

      const p = getPosterOfFile(file, 5001, 300);
      await flushMicrotasks();
      triggerFfmpegEnd();
      await p;

      expect(updateFileUrl).not.toHaveBeenCalled();
      const inputArg = ffmpegMock.mock.results[0]?.value as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      expect(inputArg).toBeDefined();
    });

    it("refreshes the URL when urlExpires is in the past", async () => {
      const expired = new Date(Date.now() - 1000);
      const file = makeFile("http://example.com/expired.mp4", {
        urlExpires: expired,
        urlRefreshDetails: {} as never,
      });

      const p = getPosterOfFile(file, 5002, 300);
      await flushMicrotasks();
      triggerFfmpegEnd();
      await p;

      expect(updateFileUrl).toHaveBeenCalledWith({ mediaId: 5002, file });
    });

    it("does not refresh the URL when urlExpires is in the future", async () => {
      const future = new Date(Date.now() + 60_000);
      const file = makeFile("http://example.com/fresh.mp4", {
        urlExpires: future,
      });

      const p = getPosterOfFile(file, 5003, 300);
      await flushMicrotasks();
      triggerFfmpegEnd();
      await p;

      expect(updateFileUrl).not.toHaveBeenCalled();
    });
  });
});
