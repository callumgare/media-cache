<script setup lang="ts">
import type { QueryFieldCondition } from "@@/types/query-condition";
import { QUERY_FIELD_DEFINITIONS } from "@@/types/query-field-definitions";
import type { QuerySchemaConfig } from "@@/types/query-schema-config.js";

const props = defineProps<{
  fieldCondition: QueryFieldCondition;
  schemaConfig: QuerySchemaConfig;
}>();
const fieldDef = computed(() => {
  return QUERY_FIELD_DEFINITIONS.find(
    (f) => f.id === props.fieldCondition.field,
  );
});
</script>

<template>
  <div class="root">
    <label>{{ fieldDef?.displayName }}</label>
    <slot />
  </div>
</template>

<style scoped>
.root {
  display: flex;
  flex-direction: column;
}
</style>
