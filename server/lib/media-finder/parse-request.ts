import type { GenericRequest } from "media-finder";
import { getMediaFinder } from ".";

export async function parseMediaFinderRequest(
  data: unknown,
): Promise<GenericRequest> {
  // Ensure it's an object (not an array, not null)
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Request data must be an object");
  }

  // Check for required string properties
  if (!("source" in data) || typeof data.source !== "string") {
    throw new Error('Request must have a "source" string field');
  }

  if (!("queryType" in data) || typeof data.queryType !== "string") {
    throw new Error('Request must have a "queryType" string field');
  }

  const source = data.source;
  const queryType = data.queryType;

  // Get MediaFinder instance and validate source/queryType exist
  const mediaFinder = await getMediaFinder();
  const handler = mediaFinder.getRequestHandler(source, queryType);

  // Validate against the handler's request schema
  return handler.requestSchema.parse(data);
}
