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
</script>

<template>
  <div class="root">
    <label>{{ fieldConfig.displayName }}</label>
    <slot />
  </div>
</template>

<style scoped>
.root {
  display: flex;
  flex-direction: column;
}
</style>
