<script setup lang="ts">
import type { QueryFieldCondition } from '@/types/query-condition'
import { type QuerySchemaConfig } from '@/types/query-schema-config.js'

const props = defineProps<{
  fieldCondition: QueryFieldCondition
  schemaConfig: QuerySchemaConfig
}>()

const fieldType = computed(() => {
  const fieldSchema = props.schemaConfig.availableFields
    .find(fieldSchema => fieldSchema.id === props.fieldCondition.field)
  const fieldType = props.schemaConfig.fieldTypes
    .find(fieldType => fieldType.name === fieldSchema.type)

  if (!fieldType) {
    throw Error(`Could not get field type info for field "${props.fieldCondition.id}" of type "${props.fieldCondition.field}"`)
  }
  return fieldType
})
</script>

<template>
  <div>
    <template
      v-if="fieldType.name === 'text'"
    >
      <QueryBuilderInputDropdown
        v-if="fieldType.getInputType() === 'dropdown'"
        :field-condition="fieldCondition"
        :schema-config="schemaConfig"
      />
      <div v-else>
        Error
      </div>
    </template>
    <template
      v-else-if="fieldType.name === 'list of text'"
    >
      <QueryBuilderInputMultiSelectDropdown
        v-if="fieldType.getInputType() === 'multi-select dropdown'"
        :field-condition="fieldCondition"
        :schema-config="schemaConfig"
      />
      <div v-else>
        Error
      </div>
    </template>
    <div v-else>
      Error
    </div>
  </div>
</template>
