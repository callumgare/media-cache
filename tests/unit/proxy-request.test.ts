import { EventEmitter } from "node:events";
import { type Server, createServer } from "node:http";
import { proxyRequest } from "@@/server/lib/proxy/index";
import type { H3Event } from "h3";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("proxyRequest", () => {
  let server: Server | undefined;

  afterEach(() => {
    if (server?.listening) {
      server.close();
    }
    server = undefined;
    vi.restoreAllMocks();
  });

  function makeEvent(): H3Event {
    return {
      headers: new Headers(),
      node: {
        res: Object.assign(new EventEmitter(), { statusCode: 200 }),
      },
    } as unknown as H3Event;
  }

  it("cancels the upstream response body when the client connection closes", async () => {
    let interval: NodeJS.Timeout | undefined;

    server = createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("chunk-0\n");

      interval = setInterval(() => {
        res.write("chunk-n\n");
      }, 50);

      res.on("close", () => {
        clearInterval(interval);
      });
    });

    await new Promise<void>((resolve, reject) => {
      server?.listen(0, "127.0.0.1", () => resolve());
      server?.once("error", reject);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not determine test server address");
    }

    const event = makeEvent();
    const proxiedResponse = await proxyRequest(
      event,
      new URL(`http://127.0.0.1:${address.port}/test`),
    );

    const reader = proxiedResponse.body?.getReader();
    expect(reader).toBeDefined();
    const firstChunk = await reader?.read();
    expect(firstChunk?.done).toBe(false);

    event.node.res.emit("close");

    const nextRead = await Promise.race([
      reader?.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Timed out waiting for canceled stream read"));
        }, 1000);
      }),
    ]);

    expect(nextRead?.done).toBe(true);
    expect(proxiedResponse.status).toBe(200);

    if (interval) {
      clearInterval(interval);
    }
  });
});
