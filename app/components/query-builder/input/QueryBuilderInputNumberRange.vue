<script setup lang="ts">
import { useMediaQuery } from "@@/stores/media-query";
import type { QueryFieldCondition } from "@@/types/query-condition";
import type { QuerySchemaConfig } from "@@/types/query-schema-config.js";

const props = defineProps<{
  fieldCondition: QueryFieldCondition;
  schemaConfig: QuerySchemaConfig;
}>();

const mediaQuery = useMediaQuery();

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
        :class="['range-input', { 'has-value': minValue !== null }]"
      />
      <InputNumber
        v-model="maxValue"
        placeholder="Max (s)"
        showClear
        :min="0"
        :max-fraction-digits="1"
        :class="['range-input', { 'has-value': maxValue !== null }]"
      />
    </InputGroup>
  </QueryBuilderInputBase>
</template>

<style scoped>
.range-input.has-value :deep(.p-inputnumber-input) {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
}
</style>
