<script setup lang="ts">
import { useMediaQuery } from "@@/stores/media-query";
import type { QueryFieldCondition } from "@@/types/query-condition";
import type { QuerySchemaConfig } from "@@/types/query-schema-config.js";

const props = defineProps<{
  fieldCondition: QueryFieldCondition;
  schemaConfig: QuerySchemaConfig;
}>();

const fieldOptions = computed(
  () => props.schemaConfig.fieldOptions[props.fieldCondition.field] ?? [],
);
const mediaQuery = useMediaQuery();
const { medias, isPending } = useMediaResults();
const zeroResults = computed(
  () => !isPending.value && medias.value.length === 0,
);

const modelValue = computed(
  () =>
    fieldOptions.value.find((o) => o.id === props.fieldCondition.value) ?? null,
);

const isFiltersToZero = computed(
  () => zeroResults.value && !!modelValue.value?.countAddedIfRemoved,
);

function onChange(option: { id: string | number } | null) {
  // Clicking the already-selected button deselects it (toggle off → clear)
  const newId = option?.id ?? "";
  mediaQuery.setFieldConditionValue(
    props.fieldCondition,
    newId === props.fieldCondition.value ? "" : newId,
  );
}

function clearValue() {
  mediaQuery.setFieldConditionValue(props.fieldCondition, "");
}
</script>

<template>
  <QueryBuilderInputBase
    :field-condition="fieldCondition"
    :schema-config="schemaConfig"
  >
    <div class="select-button-group">
      <SelectButton
        :model-value="modelValue"
        :options="fieldOptions"
        option-label="name"
        data-key="id"
        :class="['control', { 'filters-to-zero': isFiltersToZero }]"
        @update:model-value="onChange"
      >
        <template #option="{ option }">
          <span class="option-label">
            <span class="option-name">{{ option.name }}</span>
            <QueryBuilderOptionCount
              :count="option.count"
              :count-added-if-removed="option.countAddedIfRemoved"
              :filters-to-zero="zeroResults && !!option.countAddedIfRemoved"
            />
          </span>
        </template>
      </SelectButton>
      <Button
        v-if="modelValue !== null"
        icon="pi pi-times"
        text
        rounded
        size="small"
        severity="secondary"
        aria-label="Clear"
        class="clear-btn"
        @click="clearValue"
      />
    </div>
  </QueryBuilderInputBase>
</template>

<style scoped>
.select-button-group {
  display: flex;
  align-items: center;
  gap: 0.25rem;

  .control {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;

      .option-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-direction: column;
        flex: 1;
      }

      .option-name {
        flex: 1;
        color: var(--p-togglebutton-checked-color);
      }

      &:deep(.p-togglebutton-checked .p-togglebutton-content) {
        background: var(--p-highlight-background);

        .option-name {
          color: var(--p-highlight-color);
        }
      }

      &.filters-to-zero:deep(.p-togglebutton-checked .p-togglebutton-content) {
        background: var(--p-orange-100);

        .option-name {
          color: var(--p-orange-800);
        }
      }
  }

  .clear-btn {
    flex-shrink: 0;
  }
}

</style>
