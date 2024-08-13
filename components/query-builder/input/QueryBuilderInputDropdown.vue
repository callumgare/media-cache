<script setup lang="ts">
import type { QueryFieldCondition } from '@/types/query-condition'
import { type QuerySchemaConfig } from '@/types/query-schema-config.js'

const props = defineProps<{
  fieldCondition: QueryFieldCondition
  schemaConfig: QuerySchemaConfig
}>()
const fieldConfig = computed(() => {
  const fieldConfig = props.schemaConfig.availableFields.find(field => field.id === props.fieldCondition.field)
  if (!fieldConfig) {
    throw Error(`Got query field condition for undefined field: "${props.fieldCondition.field}"`)
  }
  return fieldConfig
})
const mediaQuery = useMediaQuery()
</script>

<template>
  <QueryBuilderInputBase
    :field-condition="fieldCondition"
    :schema-config="schemaConfig"
  >
    <Select
      :model-value="(fieldConfig.availableOptions ?? []).find(option => option.id === fieldCondition.value)"
      :options="fieldConfig.availableOptions ?? []"
      option-label="name"
      @update:model-value="({ id }: { id: string }) => mediaQuery.setFieldConditionValue(fieldCondition, id)"
    />
  </QueryBuilderInputBase>
</template>
