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
const hasValue = computed(() => !!props.fieldCondition.value);
const { medias, isPending } = useMediaResults();
const zeroResults = computed(
  () => !isPending.value && medias.value.length === 0,
);
const selectedOption = computed(() =>
  fieldOptions.value.find((o) => o.id === props.fieldCondition.value),
);
const isFiltersToZero = computed(
  () => zeroResults.value && !!selectedOption.value?.countAddedIfRemoved,
);
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
      :class="['control', { 'has-value': hasValue, 'filters-to-zero': isFiltersToZero }]"
      :loading="schemaConfig.loading ?? false"
      :virtual-scroller-options="{ itemSize: 38 }"
      :placeholder="`Select ${QUERY_FIELD_DEFINITIONS.find(f => f.id === fieldCondition.field)?.displayName}`"
      :show-clear="true"
      :pt="{
        overlay: {
          style: {
            'max-height': 'none',
            '--list-height': 'auto',
            ...(isFiltersToZero
              ? {
                  '--p-select-option-selected-background': 'var(--p-orange-100)',
                  '--p-select-option-selected-color': 'var(--p-orange-800)',
                  '--p-select-option-selected-focus-background': 'var(--p-orange-200)',
                  '--p-select-option-selected-focus-color': 'var(--p-orange-900)',
                }
              : {}),
          },
        },
      }"
      @update:model-value="(value: { id: string }) => mediaQuery.setFieldConditionValue(fieldCondition, value?.id ?? '')"
    >
      <template #option="{ option }">
        <span class="option-label">
          <span class="option-name">{{ option.name }}</span>
          <QueryBuilderOptionCount
            :count="option.count ?? undefined"
            :count-added-if-removed="option.countAddedIfRemoved"
            :filters-to-zero="zeroResults && !!option.countAddedIfRemoved"
          />
        </span>
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

  .control.has-value {
    background: var(--p-highlight-background);
    color: var(--p-highlight-color);

    &.filters-to-zero {
      background: var(--p-orange-100);
      color: var(--p-orange-800);
      --p-select-color: var(--p-orange-800);
    }
  }

  .option-name {
    flex: 1;
  }

  .option-label {
    display: flex;
    gap: 0.5em;
    align-items: center;
    width: 100%;
  }

  :deep(.p-select-option) {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
</style>
