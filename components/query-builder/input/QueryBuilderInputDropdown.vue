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
      <Select
        :model-value="(fieldConfig.availableOptions ?? []).find(option => option.id === fieldCondition.value)"
        :options="fieldConfig.availableOptions ?? []"
        option-label="name"
        @update:model-value="({ id }: { id: string }) => mediaQuery.setFieldConditionValue(fieldCondition, id)"
      />
      <button
        v-if="fieldCondition.value"
        @click="() => mediaQuery.setFieldConditionValue(fieldCondition, '')"
      >
        <i class="pi pi-times" />
      </button>
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
  }
</style>
