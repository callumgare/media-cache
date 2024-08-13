<script setup lang="ts">
import type { QueryFieldCondition } from '@/types/query-condition'
import { type QuerySchemaConfig } from '@/types/query-schema-config.js'

defineProps<{
  fieldCondition: QueryFieldCondition
  schemaConfig: QuerySchemaConfig
}>()
</script>

<template>
  <div>
    <QueryBuilderInputDropdown
      :field-condition="fieldCondition"
      :schema-config="schemaConfig"
    />
  </div>
</template>
