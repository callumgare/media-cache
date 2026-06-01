<script setup lang="ts">
defineProps<{
  count: number | null | undefined;
  countAddedIfRemoved?: number | null;
}>();
</script>

<template>
  <span
    v-if="countAddedIfRemoved != null"
    class="option-count added-if-removed"
  >+{{ countAddedIfRemoved }}</span>
  <span
    v-else-if="count != null"
    class="option-count"
  >{{ count }}</span>
</template>

<style scoped>
.option-count {
  color: var(--p-text-muted-color);
  font-size: 0.85em;

  &.added-if-removed {
    opacity: 0.4;
  }
}
</style>
