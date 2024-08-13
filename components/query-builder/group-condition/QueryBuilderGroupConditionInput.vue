<script setup lang="ts">
import type { QueryGroupCondition } from '@/types/query-condition'
import { type QuerySchemaConfig } from '@/types/query-schema-config.js'

defineProps<{
  groupCondition: QueryGroupCondition
  schemaConfig: QuerySchemaConfig
}>()
</script>

<template>
  <ul>
    <li
      v-for="condition in groupCondition.conditions"
      :key="condition.id"
      class="item"
    >
      <QueryBuilderGroupConditionInput
        v-if="condition.type === 'group'"
        :group-condition="condition"
        :schema-config="schemaConfig"
      />
      <QueryBuilderFieldConditionInput
        v-else-if="condition.type === 'field'"
        :field-condition="condition"
        :schema-config="schemaConfig"
      />
    </li>
  </ul>
</template>

<style scoped>
  ul {
    padding-inline-start: 0;
    list-style-type: none;
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    justify-content: center;
    align-items: start;
  }

  li {
    max-height: 300px;
  }
</style>
