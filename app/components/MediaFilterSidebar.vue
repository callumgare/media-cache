<script setup lang="ts">
import type { APIMediaFacetsResponse, FacetCount, FacetResult, SourceFacetCount, TagFacetCount, TypeFacetCount } from '@@/types/api-media-facets'
import type { QuerySchemaConfig } from '@@/types/query-schema-config.js'
import { useMediaQuery } from '@@/stores/media-query'

function findFieldCounts(facets: FacetResult | null | undefined, field: string): FacetCount[] {
  if (!facets) return []
  if (facets.type === 'field') return facets.field === field ? facets.counts : []
  for (const condition of facets.conditions) {
    const found = findFieldCounts(condition, field)
    if (found.length > 0) return found
  }
  return []
}

const { data: finderDetails, error: finderDetailsError } = await useFetch('/api/admin/finder-details')
if (finderDetailsError.value) {
  throw finderDetailsError.value
}
const sources = Object.values(finderDetails.value?.sources || {})

const mediaQuery = useMediaQuery()
const mediaQueryCondition = ref(mediaQuery.condition)
mediaQuery.$subscribe(() => {
  mediaQueryCondition.value = mediaQuery.condition
})

const selectedTagIds = computed<number[]>(() => {
  const tagsNode = mediaQuery.conditionNodes.find(node => node.type === 'field' && node.field === 'tags')
  if (!tagsNode || tagsNode.type !== 'field') return []
  const value = tagsNode.value
  if (!Array.isArray(value)) return []
  return value.filter((id): id is number => typeof id === 'number')
})

const { data: facets } = useQuery({
  queryKey: ['media-facets', mediaQueryCondition],
  queryFn: () => $fetch<APIMediaFacetsResponse>('/api/media-facets', { method: 'POST', body: mediaQueryCondition.value }),
})

const querySchemaConfig = computed<QuerySchemaConfig>(() => ({
  availableFields: [
    {
      id: 'source',
      displayName: 'Source',
      type: 'text',
      availableOptions: sources.map(s => ({
        ...s,
        count: facets.value
          ? ((findFieldCounts(facets.value, 'source') as SourceFacetCount[]).find(f => f.finderSourceId === s.id)?.count ?? 0)
          : null,
      })).sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name)),
    },
    {
      id: 'tags',
      displayName: 'Tags',
      type: 'list of text',
      availableOptions: (finderDetails.value?.tags || []).map((g) => {
        const facet = (findFieldCounts(facets.value, 'tags') as TagFacetCount[]).find(f => f.id === g.id)
        return {
          ...g,
          count: facet?.count ?? null,
          addedIfRemoved: facet?.addedIfRemoved ?? null,
        }
      })
        // .sort((a, b) => (b.count ? 1 : 0) - (a.count ? 1 : 0))
        .filter(option => option.count || selectedTagIds.value.includes(option.id))
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
    },
    {
      id: 'type',
      displayName: 'Type',
      type: 'text',
      availableOptions: [
        { id: 'video', name: 'Video' },
        { id: 'video-with-audio', name: 'Video With Audio' },
        { id: 'video-without-audio', name: 'Video Without Audio' },
        { id: 'image', name: 'Image' },
      ].map(option => ({
        ...option,
        count: (findFieldCounts(facets.value, 'type') as TypeFacetCount[]).find(f => f.value === option.id)?.count ?? null,
      })),
    },
  ],
  fieldTypes: [
    {
      name: 'text',
      operators: ['equals'],
      getInputType: () => 'dropdown',
    },
    {
      name: 'list of text',
      operators: ['includes all'],
      getInputType: () => 'multi-select dropdown',
    },
  ],
}))
</script>

<template>
  <div class="root">
    <ClientOnly
      fallback-tag="span"
      fallback="Loading..."
    >
      <QueryBuilderGroupConditionInput
        :group-condition="mediaQuery.condition"
        :schema-config="querySchemaConfig"
      />
    </ClientOnly>
  </div>
</template>

<style scoped>
  .root {
    padding: 1em;
  }
</style>
