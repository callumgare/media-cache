<script setup lang="ts">
import { useMediaQuery } from "@@/stores/media-query";
import type { QueryGroupCondition } from "@@/types/query-condition";
import { QUERY_FIELD_DEFINITIONS } from "@@/types/query-field-definitions";
import type { QuerySchemaConfig } from "@@/types/query-schema-config.js";

const props = defineProps<{
  groupCondition: QueryGroupCondition;
  schemaConfig: QuerySchemaConfig;
  isRoot?: boolean;
  editMode?: boolean;
}>();

const mediaQuery = useMediaQuery();
</script>

<template>
  <div :class="['group', { 'group--root': isRoot, 'group--nested': !isRoot }]">
    <div v-if="!isRoot && editMode" class="group-operator">
      <Select
        :model-value="groupCondition.operator"
        :options="[{ value: 'AND', label: 'AND' }, { value: 'OR', label: 'OR' }]"
        option-value="value"
        option-label="label"
        class="operator-select"
        @update:model-value="(op: 'AND' | 'OR') => mediaQuery.setGroupOperator(groupCondition.id, op)"
      />
    </div>
    <ul>
      <li
        v-for="condition in groupCondition.conditions"
        :key="condition.id"
        class="item"
      >
        <QueryBuilderGroupConditionInput
          v-if="condition.type === 'group'"
          :group-condition="condition"
          :schema-config="schemaConfig"
          :is-root="false"
          :edit-mode="editMode"
        />
        <QueryBuilderFieldConditionInput
          v-else-if="condition.type === 'field'"
          :field-condition="condition"
          :schema-config="schemaConfig"
          :edit-mode="editMode"
        />
      </li>
    </ul>
    <div v-if="editMode" class="add-controls">
      <Button
        label="Add Rule +"
        size="small"
        severity="secondary"
        @click="mediaQuery.addFieldNode(groupCondition.id, QUERY_FIELD_DEFINITIONS[0]?.id ?? 'source')"
      />
      <Button
        label="Add Group +"
        size="small"
        severity="secondary"
        @click="mediaQuery.addGroupNode(groupCondition.id)"
      />
    </div>
  </div>
</template>

<style scoped>
  .group {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }

  .group--nested {
    position: relative;
    padding-left: 1.25em;

    &::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--p-content-border-color);
    }
  }

  ul {
    padding-inline-start: 0;
    list-style-type: none;
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    justify-content: center;
    align-items: start;
  }

  li {
    width: 100%;
  }

  .group-operator {
    margin-bottom: 0.25em;

    .operator-select {
      width: auto;
    }
  }

  .add-controls {
    display: flex;
    gap: 0.5em;
    margin-top: 0.25em;
  }
</style>
