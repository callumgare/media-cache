<script setup lang="ts">
const modelValue = defineModel<string[]>();

const props = defineProps<{
  id?: string;
  disabled?: boolean;
  placeholder?: string;
}>();

const newItem = ref("");
function addItem() {
  if (!modelValue.value) {
    modelValue.value = [];
  }
  modelValue.value = [...modelValue.value, newItem.value];
  newItem.value = "";
}
function removeItem(index: number) {
  if (!modelValue.value) {
    modelValue.value = [];
  }
  modelValue.value = modelValue.value.filter((_, i) => i !== index);
}
</script>

<template>
  <div class="textlist p-inputwrapper">
    <ul
      v-if="modelValue?.length"
      class="list p-component"
    >
      <li
        v-for="(item, index) in modelValue"
        :key="index"
      >
        <div class="content">
          {{ item }}
        </div>
        <div>
          <Button
            variant="link"
            @click="removeItem(index)"
          >
            <span class="pi pi-times" />
          </Button>
        </div>
      </li>
    </ul>
    <InputGroup class="add-item p-component">
      <InputText
        v-model="newItem"
        :placeholder="props.placeholder ?? 'New Item'"
        :disabled="props.disabled"
        @blur="newItem && addItem()"
      />
      <InputGroupAddon>
        <Button
          icon="pi pi-plus"
          severity="secondary"
          @click="addItem"
        />
      </InputGroupAddon>
    </InputGroup>
  </div>
</template>

<style scoped>
.textlist {
  font-family: inherit;
  font-feature-settings: inherit;
  color: var(--p-form-field-color);
  box-shadow: var(--p-form-field-shadow);
  display: flex;
  flex-direction: column;
  background-color: var(--p-form-field-background);
  border: 1px solid var(--p-form-field-border-color);
  border-radius: var(--p-form-field-border-radius);

  > *:first-child {
    border-radius: 2em;
  }

  ul.list {
    list-style-type: none;
    padding: 0;
    margin: 0;

    li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--p-surface-800);

      .content {
        padding: 0.5em 0.8em;
        text-overflow: ellipsis;
        overflow: hidden;
      }
    }
  }

  .add-item {
    --p-inputtext-shadow: none;

    .p-inputgroupaddon {
      align-items: stretch;
    }
  }
  :deep(.p-inputtext), :deep(.p-inputgroupaddon) {
    margin-top: -1px;
    margin-bottom: -1px;
  }
  :deep(.p-inputtext) {
    margin-left: -1px;
  }
  :deep(.p-inputgroupaddon) {
    margin-right: -1px;
  }
  .add-item:not(:first-child) :deep(.p-inputtext), .add-item:not(:first-child) :deep(.p-inputgroupaddon) {
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }

}
</style>

<style>
.p-inputgroup > .textlist {
  border-radius: 0;
  
  .p-inputtext, .p-inputgroupaddon {
    border-radius: 0;
  }
  
  &:first-child, &:first-child .p-inputtext {
    border-top-left-radius: var(--p-form-field-border-radius);
    border-bottom-left-radius: var(--p-form-field-border-radius);
  }
  &:last-child, &:last-child .p-inputgroupaddon {
    border-top-right-radius: var(--p-form-field-border-radius);
    border-bottom-right-radius: var(--p-form-field-border-radius);
  }
}
</style>
