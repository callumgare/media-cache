import type { FacetCount, FacetFieldResult, FacetGroupResult, FacetResult } from '@@/types/api-media-facets'
import type { QueryCondition, QueryFieldCondition, QueryGroupCondition } from '@@/types/query-condition'
import { fetchFieldCounts } from '../lib/media-facets'

function collectFieldConditions(condition: QueryCondition): QueryFieldCondition[] {
  if (condition.type === 'field') return [condition]
  return condition.conditions.flatMap(collectFieldConditions)
}

function buildFacetTree(condition: QueryCondition, facetsByNodeId: Map<number, FacetCount[]>): FacetResult {
  if (condition.type === 'group') {
    return {
      id: condition.id,
      type: 'group',
      conditions: condition.conditions.map(c => buildFacetTree(c, facetsByNodeId)),
    } satisfies FacetGroupResult
  }
  return {
    id: condition.id,
    type: 'field',
    field: condition.field,
    counts: facetsByNodeId.get(condition.id) ?? [],
  } satisfies FacetFieldResult
}

export default defineEventHandler(async (event): Promise<FacetResult> => {
  const body: QueryGroupCondition = await readBody(event)

  const fieldConditions = collectFieldConditions(body)
  const facetsByNodeId = new Map<number, FacetCount[]>()

  await Promise.all(fieldConditions.map(async (condition) => {
    facetsByNodeId.set(condition.id, await fetchFieldCounts(condition, body))
  }))

  return buildFacetTree(body, facetsByNodeId)
})
