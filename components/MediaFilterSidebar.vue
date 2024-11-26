<script setup lang="ts">
import { type QuerySchemaConfig } from '@/types/query-schema-config.js'

const { data: finderDetails, error: finderDetailsError } = await useFetch('/api/admin/finder-details')
if (finderDetailsError.value) {
  throw finderDetailsError.value
}
const sources = Object.values(finderDetails.value?.sources || {})

const mediaQuery = useMediaQuery()
const querySchemaConfig: QuerySchemaConfig = {
  availableFields: [
    {
      id: 'source',
      displayName: 'Source',
      type: 'text',
      availableOptions: sources,
    },
    {
      id: 'tags',
      displayName: 'Tags',
      type: 'list of text',
      availableOptions: finderDetails.value?.tags || [],
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
      ],
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
}
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
