<script setup lang="ts">
import { useMediaQuery } from "@@/stores/media-query";
import type { QueryFieldCondition } from "@@/types/query-condition";
import { QUERY_FIELD_DEFINITIONS } from "@@/types/query-field-definitions";
import {
  QUERY_FIELD_TYPE_DEFINITIONS,
  type WidgetId,
} from "@@/types/query-field-type-definitions";
import type { QuerySchemaConfig } from "@@/types/query-schema-config";

const WIDGET_DISPLAY_NAMES: Record<WidgetId, string> = {
  dropdown: "Dropdown",
  "multi-select-dropdown": "Multi-select",
  listbox: "Listbox",
  "number-range": "Number range",
  "select-button": "Select button",
};

const props = defineProps<{
  fieldCondition: QueryFieldCondition;
  schemaConfig: QuerySchemaConfig;
}>();

const mediaQuery = useMediaQuery();

const fieldDef = computed(() =>
  QUERY_FIELD_DEFINITIONS.find((f) => f.id === props.fieldCondition.field),
);

const fieldTypeDef = computed(() => {
  if (!fieldDef.value) return null;
  return QUERY_FIELD_TYPE_DEFINITIONS.find(
    (t) => t.dataType === fieldDef.value?.dataType,
  );
});

const fieldSelectOptions = QUERY_FIELD_DEFINITIONS.map((f) => ({
  value: f.id,
  label: f.displayName,
}));

const operatorSelectOptions = computed(() =>
  (fieldTypeDef.value?.operators ?? []).map((op) => ({
    value: op.id,
    label: op.displayName,
  })),
);

const widgetSelectOptions = computed(() => {
  const widgets = fieldTypeDef.value?.availableWidgets ?? [];
  if (widgets.length <= 1) return null;
  return widgets.map((w) => ({ value: w, label: WIDGET_DISPLAY_NAMES[w] }));
});

const currentWidgetId = computed(
  () =>
    mediaQuery.widgetOverrides[props.fieldCondition.id] ??
    fieldTypeDef.value?.defaultWidget ??
    null,
);

function onFieldChange(fieldId: string) {
  mediaQuery.setFieldType(props.fieldCondition.id, fieldId);
}

function onOperatorChange(operator: string) {
  mediaQuery.setOperator(props.fieldCondition.id, operator);
}

function onWidgetChange(widget: WidgetId) {
  mediaQuery.setWidgetOverride(props.fieldCondition.id, widget);
}
</script>

<template>
  <Card class="field-edit-card">
    <template #content>
      <div class="field-edit-row">
        <div class="handle-section">
          <span class="drag-handle" title="Drag to reorder">⠿</span>
        </div>
        <div class="selects-section">
          <label class="select-field select-field--grow">
            <span class="select-label">Field</span>
            <Select
              :model-value="fieldCondition.field"
              :options="fieldSelectOptions"
              option-value="value"
              option-label="label"
              @update:model-value="onFieldChange"
            />
          </label>
          <label class="select-field">
            <span class="select-label">Operator</span>
            <Select
              :model-value="fieldCondition.operator"
              :options="operatorSelectOptions"
              option-value="value"
              option-label="label"
              @update:model-value="onOperatorChange"
            />
          </label>
          <label v-if="widgetSelectOptions" class="select-field">
            <span class="select-label">Display as</span>
            <Select
              :model-value="currentWidgetId"
              :options="widgetSelectOptions"
              option-value="value"
              option-label="label"
              @update:model-value="onWidgetChange"
            />
          </label>
        </div>
        <div class="delete-section">
          <Button
            icon="pi pi-trash"
            size="small"
            severity="danger"
            text
            aria-label="Delete rule"
            @click="mediaQuery.removeNode(fieldCondition.id)"
          />
        </div>
      </div>
    </template>
  </Card>
</template>

<style scoped>
.field-edit-card :deep(.p-card-body) {
  padding: 0.4rem 0.6rem;
}

.field-edit-row {
  display: flex;
  align-items: stretch;
  gap: 0.5em;
  width: 100%;
}

.handle-section {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.selects-section {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 0.4em;
  flex: 1 1 0;
  min-width: 0;
}

.delete-section {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.drag-handle {
  cursor: grab;
  color: var(--p-text-muted-color);
  font-size: 1.2rem;
  line-height: 1;
  user-select: none;
}

.drag-handle:active {
  cursor: grabbing;
}

.select-field {
  display: flex;
  flex-direction: column;
  gap: 0.15em;
}

.select-field--grow {
  flex: 1 1 8rem;
  min-width: 0;
}

.select-label {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  line-height: 1;
}
</style>
