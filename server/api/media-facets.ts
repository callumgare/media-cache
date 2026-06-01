import type {
  FacetCount,
  FacetFieldResult,
  FacetGroupResult,
  FacetResult,
  SourceFacetCount,
} from "@@/types/api-media-facets";
import type {
  QueryCondition,
  QueryFieldCondition,
  QueryGroupCondition,
} from "@@/types/query-condition";
import { defineEventHandler, readBody } from "h3";
import { getLiase } from "../lib/liase";
import { fetchFieldCounts } from "../lib/media-facets";
import { db, dbSchema } from "../utils/drizzle";

function collectFieldConditions(
  condition: QueryCondition,
): QueryFieldCondition[] {
  if (condition.type === "field") return [condition];
  return condition.conditions.flatMap(collectFieldConditions);
}

function buildFacetTree(
  condition: QueryCondition,
  facetsByNodeId: Map<number, FacetCount[]>,
): FacetResult {
  if (condition.type === "group") {
    return {
      id: condition.id,
      type: "group",
      conditions: condition.conditions.map((c) =>
        buildFacetTree(c, facetsByNodeId),
      ),
    } satisfies FacetGroupResult;
  }
  return {
    id: condition.id,
    type: "field",
    field: condition.field,
    counts: facetsByNodeId.get(condition.id) ?? [],
  } satisfies FacetFieldResult;
}

export default defineEventHandler(async (event): Promise<FacetResult> => {
  const body: QueryGroupCondition = await readBody(event);

  const fieldConditions = collectFieldConditions(body);
  const facetsByNodeId = new Map<number, FacetCount[]>();

  const hasSourceCondition = fieldConditions.some((c) => c.field === "source");

  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);
  const userId = user?.id ?? null;

  const [, sourceNameById] = await Promise.all([
    Promise.all(
      fieldConditions.map(async (condition) => {
        facetsByNodeId.set(
          condition.id,
          await fetchFieldCounts(condition, body, userId),
        );
      }),
    ),
    hasSourceCondition
      ? getLiase().then(
          (liase) => new Map(liase.sources.map((s) => [s.id, s.displayName])),
        )
      : Promise.resolve(new Map<string, string>()),
  ]);

  // Enrich source facets with display names from liase
  for (const condition of fieldConditions) {
    if (condition.field === "source") {
      const counts = facetsByNodeId.get(condition.id) as SourceFacetCount[];
      facetsByNodeId.set(
        condition.id,
        counts.map((c) => ({
          ...c,
          name: sourceNameById.get(c.liaseSourceId) ?? null,
        })),
      );
    }
  }

  return buildFacetTree(body, facetsByNodeId);
});
