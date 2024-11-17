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
      id: 'group',
      displayName: 'Group',
      type: 'text',
      availableOptions: finderDetails.value?.groups || [],
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
  ],
}
</script>

<template>
  <div class="root">
    <QueryBuilderGroupConditionInput
      :group-condition="mediaQuery.condition"
      :schema-config="querySchemaConfig"
    />
  </div>
</template>

<style scoped>
  .root {
    margin: 1em;
  }
</style>
