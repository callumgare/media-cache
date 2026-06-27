import type { QueryVariation } from "@@/server/database/schema";
import type { GenericRequest } from "@liase/core";
import { getLiase } from ".";
import { expandVariation } from "./run-query";

export async function parseLiaseRequest(
  data: unknown,
  { queryVariations }: { queryVariations?: QueryVariation[] } = {},
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

  // Get Liase instance and validate source/queryType exist
  const liase = await getLiase();
  const handler = liase.getRequestHandler(source, queryType);

  // Validate against the handler's request schema, both to ensure the request is valid but also to normalise the
  // request (e.g. coerce types, etc.) for any given request fields. But we don't want to include fields that were
  // added via defaults but were not present in the original input. Nor do we want to include fields are part of a
  // variation (we only include variation fields to make sure the request is valid when combined). So we parse then
  // only copy out the fields in the original request.
  const firstQueryVariation = queryVariations?.[0];
  const request = firstQueryVariation
    ? expandVariation(data as GenericRequest, firstQueryVariation)[0]
    : data;
  const parsed = handler.requestSchema.parse(request) as Record<
    string,
    unknown
  >;
  const normalisedRequest: GenericRequest = {} as GenericRequest;
  for (const key of Object.keys(data)) {
    normalisedRequest[key] = parsed[key];
  }
  return normalisedRequest;
}
