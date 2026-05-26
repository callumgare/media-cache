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
    <MultiSelect
      display="chip"
      :options="fieldOptions"
      option-label="name"
      filter
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
          <span
            v-if="selected && option.countAddedIfRemoved != null"
            class="option-count added-if-removed"
          >+{{ option.countAddedIfRemoved }}</span>
          <span
            v-else
            class="option-count"
          >{{ option.count ?? 0 }}</span>
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

  .option-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex: 1;

    &.dimmed {
      opacity: 0.4;
    }
  }

  .option-name {
    flex: 1;
  }

  .option-count {
    color: var(--p-text-muted-color);
    font-size: 0.85em;
    margin-left: 0.5em;

    &.added-if-removed {
      opacity: 0.4;
    }
  }
</style>
