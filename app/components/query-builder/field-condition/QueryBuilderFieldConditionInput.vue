<script setup lang="ts">
import { useMediaQuery } from "@@/stores/media-query";
import type { QueryFieldCondition } from "@@/types/query-condition";
import { QUERY_FIELD_DEFINITIONS } from "@@/types/query-field-definitions";
import { QUERY_FIELD_TYPE_DEFINITIONS } from "@@/types/query-field-type-definitions";
import type { QuerySchemaConfig } from "@@/types/query-schema-config.js";

const props = defineProps<{
  fieldCondition: QueryFieldCondition;
  schemaConfig: QuerySchemaConfig;
  editMode?: boolean;
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

const widgetId = computed(() => {
  const override = mediaQuery.widgetOverrides[props.fieldCondition.id];
  if (override) return override;
  return fieldTypeDef.value?.defaultWidget ?? null;
});
</script>

<template>
  <div>
    <QueryBuilderFieldConditionEdit
      v-if="editMode"
      :field-condition="fieldCondition"
      :schema-config="schemaConfig"
    />
    <template v-else>
      <QueryBuilderInputDropdown
        v-if="widgetId === 'dropdown'"
        :field-condition="fieldCondition"
        :schema-config="schemaConfig"
      />
      <QueryBuilderInputMultiSelectDropdown
        v-else-if="widgetId === 'multi-select-dropdown'"
        :field-condition="fieldCondition"
        :schema-config="schemaConfig"
      />
      <QueryBuilderInputListbox
        v-else-if="widgetId === 'listbox'"
        :field-condition="fieldCondition"
        :schema-config="schemaConfig"
      />
      <QueryBuilderInputNumberRange
        v-else-if="widgetId === 'number-range'"
        :field-condition="fieldCondition"
        :schema-config="schemaConfig"
      />
      <div v-else>
        Error: unknown widget for field "{{ fieldCondition.field }}"
      </div>
    </template>
  </div>
</template>
