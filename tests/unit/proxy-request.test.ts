import { EventEmitter } from "node:events";
import { proxyRequest } from "@@/server/lib/proxy/index";
import type { H3Event } from "h3";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("proxyRequest", () => {
  afterEach(() => {
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
    let canceled = false;
    const body = new ReadableStream({
      start() {},
      cancel() {
        canceled = true;
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(body, { status: 200 }),
    );

    const event = makeEvent();
    const proxiedResponse = await proxyRequest(
      event,
      new URL("https://example.com/test"),
    );

    event.node.res.emit("close");

    expect(canceled).toBe(true);
    expect(proxiedResponse.status).toBe(200);
  });
});
