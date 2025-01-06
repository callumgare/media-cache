import { sanitizeStatusCode, createError, type H3Event, type H3EventContext } from 'h3'

// Based of h3's sendProxy but allows the response to be modified before sent
export async function proxyRequest(event: H3Event, target: URL, opts?: RequestInit & { context?: H3EventContext }): Promise<Response> {
  let response
  try {
    // Based on h3's fetchWithEvent
    response = await fetch(target.href, {
      ...opts,
      headers: {
        ...safeHeaders(event.headers),
        host: target.host,
        referer: target.href,
        ...opts?.headers,
      },
    })
  }
  catch (error) {
    console.error(target.href)
    throw createError({
      status: 502,
      statusMessage: 'Bad Gateway',
      cause: error,
    })
  }

  const resHeaders = new Headers(response.headers)
  // I can guess but not 100% sure why h3's sendProxy drops these headers in particular
  for (const header of ['content-encoding', 'content-length', 'set-cookie']) {
    resHeaders.delete(header)
  }

  // If it is desirable to process cookies set in the upstream's response then see
  // the source code for h3's sendProxy for a guide

  return new Response(response.body, {
    status: sanitizeStatusCode(
      response.status,
      event.node.res.statusCode,
    ),
    statusText: sanitizeStatusMessage(response.statusText),
    headers: resHeaders,
  })
}

function safeHeaders(headers: Headers) {
  const headersAllowList = [
    'accept',
    'accept-encoding',
    'accept-language',
    'cache-control',
    'range',
    'pragma',
    'priority',
    'user-agent',
    'upgrade-insecure-requests',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
    'te', // Not sure about this once since I'm not sure if we forward trailers
    'x-playback-session-id',
  ]

  const safeHeaders: Record<string, string> = {}
  for (const [key, value] of headers.entries()) {
    if (headersAllowList.includes(key)) {
      safeHeaders[key] = value
    }
  }
  return safeHeaders
}
