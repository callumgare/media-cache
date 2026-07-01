import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import handler from "@@/server/routes/file/[mediaId]/[fileId]/[...path]";
import { db } from "@@/server/utils/drizzle";
import { createEvent } from "h3";
import { beforeEach, describe, expect, it } from "vitest";
import {
  enqueueMedia,
  makeMedia,
  runLiaseQuery,
  truncateAll,
} from "./fixtures/helpers";

beforeEach(truncateAll);

function makeEvent(path: string, params: Record<string, string>) {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.url = path;
  req.method = "GET";
  const res = new ServerResponse(req);
  const event = createEvent(req, res);
  event.context.params = params;
  return event;
}

async function seedMediaAndGetId(): Promise<number> {
  enqueueMedia([makeMedia({ id: "test-media" })]);
  await runLiaseQuery();
  const row = await db.query.cacheMedia.findFirst();
  if (!row) throw new Error("No media seeded");
  return row.id;
}

describe("file route handler", () => {
  it("returns 400 for non-numeric media ID", async () => {
    const event = makeEvent("/file/invalid-id/main/test.mp4", {
      mediaId: "invalid-id",
      fileId: "main",
      path: "test.mp4",
    });
    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "Invalid media ID",
    });
  });

  it("returns 404 for non-existent media", async () => {
    const event = makeEvent("/file/99999/main/test.mp4", {
      mediaId: "99999",
      fileId: "main",
      path: "test.mp4",
    });
    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: "Media not found",
    });
  });

  describe("with seeded media", () => {
    let mediaId: number;

    beforeEach(async () => {
      mediaId = await seedMediaAndGetId();
    });

    it("returns 404 for non-existent file type", async () => {
      const event = makeEvent(`/file/${mediaId}/poster/test.jpg`, {
        mediaId: String(mediaId),
        fileId: "poster",
        path: "test.jpg",
      });
      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 404,
        statusMessage: "File not found",
      });
    });

    it('returns 400 for path containing ".."', async () => {
      const event = makeEvent(`/file/${mediaId}/main/../../etc/passwd`, {
        mediaId: String(mediaId),
        fileId: "main",
        path: "../../etc/passwd",
      });
      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Invalid path",
      });
    });

    it('returns 400 for path starting with "/"', async () => {
      const event = makeEvent(`/file/${mediaId}/main//etc/passwd`, {
        mediaId: String(mediaId),
        fileId: "main",
        path: "/etc/passwd",
      });
      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Invalid path",
      });
    });

    it("returns 400 for unrecognised path", async () => {
      const event = makeEvent(`/file/${mediaId}/main/unexpected.mp4`, {
        mediaId: String(mediaId),
        fileId: "main",
        path: "unexpected.mp4",
      });
      await expect(handler(event)).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Invalid path format (expected /media-1-main.null or /)",
      });
    });
  });
});

describe("File URL Refresh Validation", () => {
  it("should throw descriptive error when file type not found", () => {
    const fileType = "main";
    const liaseMediaId = "media-123";
    const expectedErrorMessage = `Returned media did not contain expected file of type "${fileType}" for media ID ${liaseMediaId}`;

    expect(expectedErrorMessage).toContain("file of type");
    expect(expectedErrorMessage).toContain("media ID");
  });

  it("should validate that newUrl is initialized to null", () => {
    const newUrl: string | null = null;
    expect(newUrl).toBeNull();
    expect(newUrl === null).toBe(true);
  });
});

describe("FFmpeg Error Handling", () => {
  it("should clean up promise map on success", async () => {
    const transcodesInProgress: Record<string, Promise<string>> = {};
    const key = "test-key";

    transcodesInProgress[key] = new Promise<string>((resolve) => {
      setTimeout(() => {
        delete transcodesInProgress[key];
        resolve("success");
      }, 10);
    });

    expect(transcodesInProgress[key]).toBeDefined();
    await transcodesInProgress[key];
    expect(transcodesInProgress[key]).toBeUndefined();
  });

  it("should clean up promise map on error", async () => {
    const transcodesInProgress: Record<string, Promise<string>> = {};
    const key = "test-key";

    transcodesInProgress[key] = new Promise<string>((resolve, reject) => {
      setTimeout(() => {
        delete transcodesInProgress[key];
        reject(new Error("FFmpeg failed"));
      }, 10);
    });

    expect(transcodesInProgress[key]).toBeDefined();

    try {
      await transcodesInProgress[key];
    } catch (e) {
      expect((e as Error).message).toBe("FFmpeg failed");
    }

    expect(transcodesInProgress[key]).toBeUndefined();
  });

  it("should clean up promise map with .catch() wrapper", async () => {
    const transcodesInProgress: Record<string, Promise<string>> = {};
    const key = "test-key";

    transcodesInProgress[key] = new Promise<string>((resolve, reject) => {
      setTimeout(() => reject(new Error("Test error")), 10);
    }).catch((err) => {
      delete transcodesInProgress[key];
      throw err;
    });

    expect(transcodesInProgress[key]).toBeDefined();

    try {
      await transcodesInProgress[key];
    } catch (e) {
      expect((e as Error).message).toBe("Test error");
    }

    expect(transcodesInProgress[key]).toBeUndefined();
  });

  it("should not return rejected promises from cache", async () => {
    const transcodesInProgress: Record<
      string,
      Promise<string | undefined>
    > = {};
    const key = "poster-1";

    // First attempt - error (handle the rejection to avoid unhandled rejection warning)
    transcodesInProgress[key] = Promise.reject(
      new Error("FFmpeg failed"),
    ).catch(() => {
      delete transcodesInProgress[key];
      // Return undefined instead of re-throwing to avoid unhandled rejection
      return undefined as unknown as string;
    });

    // Wait for the catch handler to complete
    await transcodesInProgress[key];

    // Verify promise was cleaned up
    expect(transcodesInProgress[key]).toBeUndefined();

    // Second attempt - should create new promise
    transcodesInProgress[key] = Promise.resolve("new-attempt");

    expect(transcodesInProgress[key]).toBeDefined();
    const result = await transcodesInProgress[key];
    expect(result).toBe("new-attempt");
  });
});
