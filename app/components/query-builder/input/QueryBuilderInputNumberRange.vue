<script setup lang="ts">
import { useMediaQuery } from "@@/stores/media-query";
import type { QueryFieldCondition } from "@@/types/query-condition";
import type { QuerySchemaConfig } from "@@/types/query-schema-config.js";

const props = defineProps<{
  fieldCondition: QueryFieldCondition;
  schemaConfig: QuerySchemaConfig;
}>();

const mediaQuery = useMediaQuery();
const { medias, isPending } = useMediaResults();
const zeroResults = computed(
  () => !isPending.value && medias.value.length === 0,
);
const minCountAddedIfRemoved = computed(
  () =>
    props.schemaConfig.fieldOptions[props.fieldCondition.field]?.[0]
      ?.countAddedIfRemoved ?? null,
);
const maxCountAddedIfRemoved = computed(
  () =>
    props.schemaConfig.fieldOptions[props.fieldCondition.field]?.[1]
      ?.countAddedIfRemoved ?? null,
);
const isMinFiltersToZero = computed(
  () => zeroResults.value && !!minCountAddedIfRemoved.value,
);
const isMaxFiltersToZero = computed(
  () => zeroResults.value && !!maxCountAddedIfRemoved.value,
);

type RangeValue = { min: number | null; max: number | null };

function parseValue(value: unknown): RangeValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    return {
      min: typeof v.min === "number" ? v.min : null,
      max: typeof v.max === "number" ? v.max : null,
    };
  }
  return { min: null, max: null };
}

const parsed = computed(() => parseValue(props.fieldCondition.value));

const minValue = computed({
  get: () => parsed.value.min,
  set: (v) => onUpdate({ min: v, max: parsed.value.max }),
});

const maxValue = computed({
  get: () => parsed.value.max,
  set: (v) => onUpdate({ min: parsed.value.min, max: v }),
});

function onUpdate(next: RangeValue) {
  const newValue = next.min == null && next.max == null ? "" : next;
  mediaQuery.setFieldConditionValue(props.fieldCondition, newValue);
}
</script>

<template>
  <QueryBuilderInputBase
    :field-condition="fieldCondition"
    :schema-config="schemaConfig"
  >
    <InputGroup class="range-inputs">
      <InputNumber
        v-model="minValue"
        placeholder="Min (s)"
        showClear
        :min="0"
        :max-fraction-digits="1"
        :class="['range-input', { 'has-value': minValue !== null, 'filters-to-zero': isMinFiltersToZero }]"
      />
      <InputNumber
        v-model="maxValue"
        placeholder="Max (s)"
        showClear
        :min="0"
        :max-fraction-digits="1"
        :class="['range-input', { 'has-value': maxValue !== null, 'filters-to-zero': isMaxFiltersToZero }]"
      />
    </InputGroup>
  </QueryBuilderInputBase>
</template>

<style scoped>
.range-input.has-value :deep(.p-inputnumber-input) {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
}

.range-input.filters-to-zero :deep(.p-inputnumber-input) {
  background: var(--p-orange-100);
  color: var(--p-orange-800);
}
</style>
