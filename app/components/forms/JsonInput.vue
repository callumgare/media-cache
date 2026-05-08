<script setup lang="ts">
import Textarea, {
  type TextareaProps,
  type TextareaEmits,
} from "primevue/textarea";

interface Props extends /* @vue-ignore */ Omit<TextareaProps, "modelValue"> {
  modelValue?: string;
}

interface Emits extends /* @vue-ignore */ TextareaEmits {}

defineProps<Props>();
defineEmits<Emits>();

const modelValue = defineModel<unknown>();
const jsonString = ref(JSON.stringify(modelValue.value));
const isValid = (value: string) => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};
const valid = ref(isValid(jsonString.value));
watch(jsonString, () => {
  valid.value = isValid(jsonString.value);
  if (valid.value) {
    modelValue.value = JSON.parse(jsonString.value);
  } else {
    modelValue.value = undefined;
  }
});
watch(valid, () => {
  if (valid.value) {
    jsonString.value = JSON.stringify(JSON.parse(jsonString.value), null, 2);
  }
});
</script>

<template>
  <Textarea
    v-bind="$attrs"
    :model-value="jsonString"
    :class="{ invalid: jsonString && !valid }"
    @update:model-value="(value) => { jsonString = value }"
  />
</template>

<style scoped>
  textarea {
    &.invalid {
      background-color: #ff00000f;
    }
  }
</style>
