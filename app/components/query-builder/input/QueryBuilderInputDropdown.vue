<script setup lang="ts">
import "primeicons/primeicons.css";
import { useMediaQuery } from "@@/stores/media-query";
import type { QueryFieldCondition } from "@@/types/query-condition";
import { QUERY_FIELD_DEFINITIONS } from "@@/types/query-field-definitions";
import type { QuerySchemaConfig } from "@@/types/query-schema-config.js";

const props = defineProps<{
  fieldCondition: QueryFieldCondition;
  schemaConfig: QuerySchemaConfig;
}>();
const fieldOptions = computed(
  () => props.schemaConfig.fieldOptions[props.fieldCondition.field] ?? [],
);
const mediaQuery = useMediaQuery();
</script>

<template>
  <QueryBuilderInputBase
    :field-condition="fieldCondition"
    :schema-config="schemaConfig"
  >
    <Select
      :model-value="(fieldOptions).find(option => option.id === fieldCondition.value)"
      :options="fieldOptions"
      option-label="name"
      class="control"
      :loading="schemaConfig.loading ?? false"
      :virtual-scroller-options="{ itemSize: 38 }"
      :placeholder="`Select ${QUERY_FIELD_DEFINITIONS.find(f => f.id === fieldCondition.field)?.displayName}`"
      :show-clear="true"
      @update:model-value="(value: { id: string }) => mediaQuery.setFieldConditionValue(fieldCondition, value?.id ?? '')"
    >
      <template #option="{ option }">
        <span class="option-name">{{ option.name }}</span>
        <span
          v-if="option.count != null"
          class="option-count"
        >{{ option.count }}</span>
      </template>
    </Select>
  </QueryBuilderInputBase>
</template>

<style scoped>
  .pi {
    vertical-align: middle;
  }

  .control {
    width: 100%;

    .p-inputwrapper {
      min-width: 200px;
    }
  }

  .option-name {
    flex: 1;
  }

  .option-count {
    color: var(--p-text-muted-color);
    font-size: 0.85em;
    margin-left: 0.5em;
  }

  :deep(.p-select-option) {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
</style>
