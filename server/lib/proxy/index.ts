import {
  type H3Event,
  createError,
  sanitizeStatusCode,
  sanitizeStatusMessage,
} from "h3";
import {
  type RequestInit,
  type Response as WregResponse,
  fetch,
} from "wreq-js";

// Based of h3's sendProxy but allows the response to be modified before sent
export async function proxyRequest(
  event: H3Event,
  target: URL,
  opts?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  let response: WregResponse;
  let aborted = false;
  let cancelUpstreamBody = () => {};

  // Abort handles request/connection lifecycle; explicit body cancel handles
  // already-started response streaming after fetch has resolved.
  event.node.res.once("close", () => {
    aborted = true;
    controller.abort();
    cancelUpstreamBody();
  });

  try {
    // Based on h3's fetchWithEvent
    response = await fetch(target.href, {
      ...opts,
      browser: "chrome_147",
      signal: controller.signal,
      headers: {
        ...safeHeaders(event.headers),
        host: target.host,
        ...(event.headers.has("referer") ? { referer: target.href } : {}),
        ...opts?.headers,
      },
    });
  } catch (error) {
    if (aborted) {
      throw createError({
        status: 499,
        statusMessage: "Client Closed Request",
        cause: error,
      });
    }

    console.error(target.href);
    throw createError({
      status: 502,
      statusMessage: "Bad Gateway",
      cause: error,
    });
  }

  const resHeaders = new Headers(response.headers.toObject());
  // I can guess but not 100% sure why h3's sendProxy drops these headers in particular
  for (const header of ["content-encoding", "content-length", "set-cookie"]) {
    resHeaders.delete(header);
  }

  // If it is desirable to process cookies set in the upstream's response then see
  // the source code for h3's sendProxy for a guide

  let proxiedBody: ReadableStream<Uint8Array<ArrayBuffer>> | null = null;
  const upstreamBody = response.body as
    | ReadableStream<Uint8Array<ArrayBuffer>>
    | null
    | undefined;

  if (upstreamBody) {
    const reader = upstreamBody.getReader();
    cancelUpstreamBody = () => {
      void reader.cancel().catch(() => {});
    };

    // Bridge upstream reader -> response body so we own cancellation behavior
    // and can stop reads immediately when downstream disconnects.
    proxiedBody = new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(streamController) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            streamController.close();
            return;
          }

          streamController.enqueue(value);
        } catch (error) {
          streamController.error(error);
        }
      },
      cancel() {
        return reader.cancel();
      },
    });
  }

  return new Response(proxiedBody, {
    status: sanitizeStatusCode(response.status, event.node.res.statusCode),
    statusText: sanitizeStatusMessage(response.statusText),
    headers: resHeaders,
  });
}

function safeHeaders(headers: Headers) {
  const headersAllowList = [
    "accept",
    "accept-encoding",
    "accept-language",
    "cache-control",
    "range",
    "pragma",
    "priority",
    "user-agent",
    "upgrade-insecure-requests",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "te", // Not sure about this once since I'm not sure if we forward trailers
    "x-playback-session-id",
  ];

  const safeHeaders: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    if (headersAllowList.includes(key)) {
      safeHeaders[key] = value;
    }
  }
  return safeHeaders;
}
