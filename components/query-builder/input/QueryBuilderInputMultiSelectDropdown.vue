<script setup lang="ts">
import 'primeicons/primeicons.css'
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
    <div class="control">
      <MultiSelect
        display="chip"
        :options="fieldConfig.availableOptions"
        option-label="name"
        filter
        :placeholder="`Select ${fieldConfig.displayName}`"
        :model-value="(fieldCondition.value || []).map(
          (id: string) => (fieldConfig.availableOptions ?? []).find(option => option.id === id),
        )"
        @update:model-value="(values: { id: string }[]) =>
          mediaQuery.setFieldConditionValue(fieldCondition, values.map(value => value.id))
        "
      />
    </div>
  </QueryBuilderInputBase>
</template>

<style scoped>
  .pi {
    vertical-align: middle;
  }

  .control {
    display: flex;
    gap: 0.5em;
    align-items: center;
    flex-wrap: wrap;

    .p-inputwrapper {
      min-width: 200px;
    }

    :deep(.p-multiselect-label) {
      flex-wrap: wrap;
    }
  }
</style>
