<script setup lang="ts">
const modelValue = defineModel<string[]>()

const newItem = ref('')
function addItem() {
  if (!modelValue.value) {
    modelValue.value = []
  }
  modelValue.value.push(newItem.value)
  newItem.value = ''
}
</script>

<template>
  <div class="textlist">
    <ul v-if="modelValue?.length">
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
            @click="modelValue?.splice(index, 1)"
          >
            <span class="pi pi-times" />
          </Button>
        </div>
      </li>
    </ul>
    <InputGroup class="add-item">
      <InputText
        v-model="newItem"
        placeholder="New Item"
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
  background-color: var(--p-form-field-background);
  border: 1px solid var(--p-form-field-border-color);
  border-radius: var(--p-form-field-border-radius);
  box-shadow: var(--p-form-field-shadow);
  padding: 0.5em;
  display: flex;
  flex-direction: column;
  gap: 0.5em;

  ul {
    list-style-type: none;
    padding: 0;
    margin: 0;

    li {
      display: flex;
      justify-content: space-between;
      align-items: baseline;

      .content {
        padding: 0.5em 0.8em;
      }
    }
  }

  .add-item {
    --p-inputtext-shadow: none;

    .p-inputgroupaddon {
      align-items: stretch;
    }
  }
}
</style>
