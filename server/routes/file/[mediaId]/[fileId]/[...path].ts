import { proxyRequest } from "@@/server/lib/proxy";
import { db } from "@@/server/utils/drizzle";
import {
  createError,
  defineEventHandler,
  getRequestURL,
  sendWebResponse,
} from "h3";
import { replaceLast } from "~/lib/string";
import { updateFileUrl } from "../../../../lib/liase/update-file-url";

export default defineEventHandler(async (event) => {
  const { mediaId: mediaIdString = "", fileId: fileType = "" } =
    event.context.params || {};
  const reqUrl = getRequestURL(event);
  const mediaId = Number.parseInt(mediaIdString);
  if (Number.isNaN(mediaId)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid media ID",
    });
  }

  const cacheMedia = await db.query.cacheMedia.findFirst({
    where: (m, { eq }) => eq(m.id, mediaId),
  });
  if (!cacheMedia) {
    throw createError({
      statusCode: 404,
      statusMessage: "Media not found",
    });
  }

  const file = (cacheMedia.files ?? []).find((f) => f.type === fileType);
  if (!file) {
    throw createError({
      statusCode: 404,
      statusMessage: "File not found",
    });
  }

  let fileUrl: URL;
  if (file.urlExpires && new Date() > new Date(file.urlExpires)) {
    const refreshedUrl = await updateFileUrl({ mediaId, file });
    fileUrl = new URL(refreshedUrl);
  } else {
    fileUrl = new URL(file.url);
  }
  if (reqUrl.search) {
    fileUrl.search = reqUrl.search;
  }

  // Validate path to prevent traversal attacks
  const rawPath = event.context.params?.path || "";
  if (rawPath.includes("..") || rawPath.startsWith("/")) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid path",
    });
  }

  const basePath = replaceLast(
    // We only want the path but event.path includes the query string if present
    new URL(event.path, "http://domain.tld").pathname,
    `/${rawPath}`,
  );

  const pathParam = event.path.replace(basePath, "");
  const virtualFilename = `media-${event.context.params?.mediaId}-${event.context.params?.fileId}.${file.ext}`;

  // Adaptive streaming manifests (HLS, DASH, …) reference sub-resources
  // (segments, sub-manifests) whose URLs are rewritten to route through the
  // proxy, so any sub-path must be allowed for them.
  // For all other file types only the virtual filename or no path is permitted.
  const MULTI_RESOURCE_EXTS = new Set(["m3u8", "mpd"]);
  if (
    !MULTI_RESOURCE_EXTS.has(file.ext ?? "") &&
    pathParam !== `/${virtualFilename}` &&
    pathParam !== ""
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid path format",
    });
  }

  const upstreamUrl =
    pathParam === `/${virtualFilename}`
      ? fileUrl
      : new URL(pathParam || "/", fileUrl.origin);

  let res = await proxyRequest(event, upstreamUrl);

  if (res.headers.get("content-type") === "application/vnd.apple.mpegurl") {
    const body = await res.text();
    const makeAddressAbsolute = (address: string) => {
      if (address.startsWith("/")) {
        return address.replace(/^\/\/?/, `${basePath}/`);
      }
      return basePath + upstreamUrl.pathname.replace(/\/[^/]*$/, "/") + address;
    };
    const modifiedBody = body
      .split("\n")
      .map((line) =>
        !line || line.startsWith("#") ? line : makeAddressAbsolute(line),
      )
      .join("\n");
    res = new Response(modifiedBody, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  }

  return sendWebResponse(event, res);
});
