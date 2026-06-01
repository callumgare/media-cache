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
const hasValue = computed(
  () =>
    Array.isArray(props.fieldCondition.value) &&
    props.fieldCondition.value.length > 0,
);
</script>

<template>
  <QueryBuilderInputBase
    :field-condition="fieldCondition"
    :schema-config="schemaConfig"
  >
    <MultiSelect
      display="chip"
      :options="fieldOptions"
      option-label="name"
      filter
      :class="{ 'has-value': hasValue }"
      :loading="schemaConfig.loading ?? false"
      :placeholder="`Select ${QUERY_FIELD_DEFINITIONS.find(f => f.id === fieldCondition.field)?.displayName}`"
      :virtual-scroller-options="{ itemSize: 44 }"
      :model-value="(Array.isArray(fieldCondition.value) ? fieldCondition.value : []).map(
        (id: string) => (fieldOptions).find(option => option.id === id),
      )"
      @update:model-value="(values: { id: string }[]) =>
        mediaQuery.setFieldConditionValue(fieldCondition, values.map(value => value.id))
      "
    >
      <template #option="{ option, selected }">
        <span :class="['option-label', { dimmed: !selected && !option.count }]">
          <span class="option-name">{{ option.name }}</span>
          <QueryBuilderOptionCount
            :count="option.count ?? 0"
            :count-added-if-removed="selected ? option.countAddedIfRemoved : null"
          />
        </span>
      </template>
    </MultiSelect>
  </QueryBuilderInputBase>
</template>

<style scoped>
  .pi {
    vertical-align: middle;
  }

  .control {
    width: 100%;
  }

  .p-inputwrapper {
    min-width: 200px;
  }

  :deep(.p-multiselect-label) {
    flex-wrap: wrap;
  }

  :deep(.p-multiselect.has-value .p-multiselect-label) {
    background: var(--p-highlight-background);
    color: var(--p-highlight-color);
  }

  .option-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5em;
    flex: 1;

    &.dimmed {
      opacity: 0.4;
    }
  }

  .option-name {
    flex: 1;
  }
</style>
