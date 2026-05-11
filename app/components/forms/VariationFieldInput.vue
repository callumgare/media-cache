<template>
  <template v-if="option?.type === 'string' && option?.enum">
    <Select
      :model-value="modelValue"
      :options="option.enum"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </template>
  <template v-else-if="option?.type === 'number'">
    <InputNumber
      :model-value="typeof modelValue === 'number' ? modelValue : null"
      show-buttons
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </template>
  <template v-else-if="option?.type === 'boolean'">
    <Checkbox
      :model-value="modelValue === true"
      :binary="true"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </template>
  <template v-else>
    <InputText
      :model-value="typeof modelValue === 'string' ? modelValue : ''"
      type="text"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </template>
</template>

<script setup lang="ts">
defineProps<{
  option?: {
    name: string;
    type?: string;
    enum?: unknown[];
    items?: { type?: string };
    [key: string]: unknown;
  };
  modelValue?: unknown;
}>();

defineEmits<{
  "update:modelValue": [value: unknown];
}>();
</script>
