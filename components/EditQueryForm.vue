<template>
  <form @submit.prevent="handleValidateClick">
    <div class="primary-options">
      <div class="option">
        <label for="sourceInput">Source</label>
        <Select
          id="sourceInput"
          v-model="formValue.requestOptions.source"
          :options="sources"
          option-label="name"
          option-value="id"
        />
      </div>
      <div class="option">
        <label for="requestHandlerInput">Request Handler</label>
        <Select
          id="requestHandlerInput"
          v-model="formValue.requestOptions.queryType"
          :options="requestHandlers"
          option-label="name"
          option-value="id"
        >
          <template #empty>
            {{ formValue.requestOptions.source ? "Source has no query types" : "Please select a source first" }}
          </template>
        </Select>
      </div>
    </div>
    <div
      v-if="requestOptions.length > 0"
      class="request-options"
    >
      <h2>Request Options</h2>
      <ul>
        <li
          v-for="option in requestOptions"
          :key="`${formValue.requestOptions.source} - ${formValue.requestOptions.queryType} - ${option.name}`"
        >
          <div
            v-if="option.type === 'string' && option.enum"
            class="option"
          >
            <label :for="option.name">{{ camelCaseToTitleCase(option.name) }}</label>
            <Select
              v-model="formValue.requestOptions[option.name]"
              :options="option.enum"
            />
          </div>
          <div
            v-else-if="option.type === 'string'"
            class="option"
          >
            <label :for="option.name">{{ camelCaseToTitleCase(option.name) }}</label>
            <InputText
              :id="option.name"
              v-model="formValue.requestOptions[option.name]"
              placeholder=""
              type="text"
            />
          </div>
          <div
            v-else-if="option.type === 'number'"
            class="option"
          >
            <label :for="option.name">{{ camelCaseToTitleCase(option.name) }}</label>
            <InputNumber
              :id="option.name"
              v-model="formValue.requestOptions[option.name]"
              placeholder=""
              show-buttons
            />
          </div>
          <div
            v-else-if="option.type === 'object'"
            class="option"
          >
            <label :for="option.name">{{ camelCaseToTitleCase(option.name) }}</label>
            <JsonInput
              :id="option.name"
              v-model="formValue.requestOptions[option.name]"
              rows="5"
              cols="30"
            />
          </div>
          <div
            v-else-if="option.type === 'boolean'"
            class="option"
          >
            <label
              :for="option.name"
            > {{ camelCaseToTitleCase(option.name) }} </label>
            <Checkbox
              v-model="formValue.requestOptions[option.name]"
              :binary="true"
              :input-id="option.name"
            />
          </div>
          <span v-else>
            Option type "{{ option.type }}" is unknown.
          </span>
        </li>
      </ul>
    </div>
    <div
      class="query-options"
    >
      <h2>Other Options</h2>
      <div
        class="option"
      >
        <label for="fetchCountLimit">Fetch count limit</label>
        <InputNumber
          id="fetchCountLimit"
          v-model="formValue.fetchCountLimit"
          placeholder=""
          show-buttons
        />
      </div>
    </div>

    <Button type="submit">
      Save
    </Button>
  </form>
</template>

<script setup lang="ts">
import JsonInput from './forms/JsonInput.vue'

const props = defineProps<{
  mediaQuery?: Omit<DBMediaFinderQuery, 'requestOptions'> & { requestOptions: Record<string, unknown> }
}>()

const toast = useToast()

const { data: finderDetails, error: finderDetailsError } = await useFetch('/api/admin/finder-details')

if (finderDetailsError.value) {
  throw finderDetailsError.value
}

const sources = Object.values(finderDetails.value?.sources || {})

const formValue = ref(props.mediaQuery ?? {
  requestOptions: {
    source: null,
    queryType: null,
  },
  fetchCountLimit: null,
})
const requestHandlers = computed(() => {
  return finderDetails.value?.sources[formValue.value?.requestOptions.source ?? '']?.requestHandlers
})
const requestOptions = computed(() => {
  const schema = finderDetails.value?.sources[formValue.value?.requestOptions.source ?? '']
    ?.requestHandlers.find(requestHandler => requestHandler.id === formValue.value?.requestOptions.queryType)
    ?.schema

  return schema ? convertJSONSchemaToListOfOptions(schema) : []
})

const formattedFormValue = computed(() => ({
  ...formValue.value,
  requestOptions: Object.fromEntries(
    Object.entries(formValue.value.requestOptions).filter(([,value]) => value !== null),
  ),
}))

function convertJSONSchemaToListOfOptions(schema) {
  const { source, queryType, ...otherOptions } = schema.properties || {}
  return Object.entries(otherOptions).map(([name, value]) => ({ name, ...value }))
}

function camelCaseToTitleCase(s: string) {
  const result = s.replace(/([A-Z])/g, ' $1')
  return result.charAt(0).toUpperCase() + result.slice(1)
}

async function handleValidateClick() {
  try {
    if (!formattedFormValue.value.id) {
      const mediaQuery = await $fetch('/api/admin/queries', {
        method: 'POST',
        body: {
          title: 'fake title',
          schedule: 0,
          ...formattedFormValue.value,
        },
      })
      toast.add({ severity: 'success', summary: 'Created', life: 3000 })
      await navigateTo(`/admin/queries`)
      setTimeout(() => {
        location.hash = `#query-${mediaQuery.id}`
      }, 200)
    }
    else {
      await $fetch(`/api/admin/queries/${formattedFormValue.value.id}`, {
        method: 'POST',
        body: {
          title: 'fake title',
          schedule: 0,
          ...formattedFormValue.value,
        },
      })
      toast.add({ severity: 'success', summary: 'Updated', life: 6000 })
      await navigateTo(`/admin/queries`)
      setTimeout(() => {
        location.hash = `#query-${formattedFormValue.value.id}`
      }, 200)
    }
  }
  catch (error) {
    console.error(error)
    toast.add({ severity: 'error', summary: 'Failed', detail: error.message, life: 3000 })
  }
}
</script>

<style scoped>
  form {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2em;

    .option {
      display: flex;
      flex-direction: column;
      min-width: 200px;

      --height-of-input: calc(2px + (var(--p-form-field-padding-y) * 2) + 1lh); /* 2px for border */

      :deep(input[type="text"]) {
        min-width: 200px;
        field-sizing: content;
        padding-right: 2em;
      }

      .p-checkbox {
        height: var(--height-of-input);
        align-items: center;
      }
    }

    .primary-options {
      display: flex;
      flex-flow: row wrap;
      gap: 1em;
      align-items: baseline;

      .n-form-item {
          max-width: 100%;
          width: 10em;
      }
    }

    .request-options {
      flex-direction: column;

      ul {
        list-style-type: none;
        padding-left: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 1em;
      }
    }
  }
</style>
