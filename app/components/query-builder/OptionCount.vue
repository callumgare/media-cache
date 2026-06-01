<script setup lang="ts">
defineProps<{
  count: number | null | undefined;
  countAddedIfRemoved?: number | null;
  filtersToZero?: boolean;
}>();
</script>

<template>
  <span
    v-if="countAddedIfRemoved != null"
    :class="['option-count', 'added-if-removed', { 'filters-to-zero': filtersToZero }]"
  >+{{ countAddedIfRemoved }}</span>
  <span
    v-else-if="count != null"
    :class="['option-count', { 'filters-to-zero': filtersToZero }]"
  >{{ count }}</span>
</template>

<style scoped>
.option-count {
  color: var(--p-text-muted-color);
  font-size: 0.85em;

  &.added-if-removed {
    opacity: 0.4;
  }

  &.filters-to-zero {
    color: var(--p-orange-800);
    opacity: 1;
  }
}
</style>
