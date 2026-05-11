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

  // Validate against the handler's request schema, then drop any keys that
  // Zod added via defaults but were not present in the original input.
  // This ensures that clearing a field removes it rather than resetting it
  // to its schema default.
  const inputKeys = new Set(Object.keys(data));
  const parsed = handler.requestSchema.parse(data) as Record<string, unknown>;
  for (const key of Object.keys(parsed)) {
    if (!inputKeys.has(key)) delete parsed[key];
  }
  return parsed as GenericRequest;
}
