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
              :model-value="getStringOption(option.name)"
              placeholder=""
              type="text"
              @update:model-value="setOption(option.name, $event)"
            />
          </div>
          <div
            v-else-if="option.type === 'number'"
            class="option"
          >
            <label :for="option.name">{{ camelCaseToTitleCase(option.name) }}</label>
            <InputNumber
              :id="option.name"
              :model-value="getNumberOption(option.name)"
              placeholder=""
              show-buttons
              @update:model-value="setOption(option.name, $event)"
            />
          </div>
          <div
            v-else-if="option.type === 'object'"
            class="option"
          >
            <label :for="option.name">{{ camelCaseToTitleCase(option.name) }}</label>
            <JsonInput
              :id="option.name"
              :model-value="getJsonOption(option.name)"
              rows="5"
              cols="30"
              @update:model-value="setOption(option.name, $event)"
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
          <div
            v-else-if="option.type === 'array' && option.items?.type === 'string'"
            class="option"
          >
            <label
              :for="option.name"
            > {{ camelCaseToTitleCase(option.name) }} </label>
            <TextList
              :model-value="getArrayOption(option.name)"
              name="fdsafasf"
              @update:model-value="setOption(option.name, $event)"
            />
          </div>
          <span v-else>
            Option type "{{ option.type }}" is unknown.
            <pre v-if="uiState.debugMode">{{
              JSON.stringify(option, null, 2)
            }}</pre>
            <JsonInput
              :id="option.name"
              :model-value="getJsonOption(option.name)"
              rows="5"
              cols="30"
              @update:model-value="setOption(option.name, $event)"
            />
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
import TextList from './forms/TextList.vue'
import type { FinderQuery } from '~/server/database/schema'

type JsonSchemaWithProperties = { properties: Record<string, Record<string, unknown>> }

type SchemaOption = {
  name: string
  type?: string
  enum?: unknown[]
  items?: { type?: string }
  [key: string]: unknown
}

type FormData = Partial<Omit<FinderQuery, 'requestOptions' | 'createdAt' | 'updatedAt'>> & {
  requestOptions: Record<string, unknown>
  id?: number
  createdAt?: Date | string
  updatedAt?: Date | string
}

const props = defineProps<{
  mediaQuery?: Omit<FinderQuery, 'requestOptions' | 'createdAt' | 'updatedAt'> & {
    requestOptions: Record<string, unknown>
    createdAt?: Date | string
    updatedAt?: Date | string
  }
}>()

const toast = useToast()

const uiState = useUiState()

const { data: finderDetails, error: finderDetailsError } = await useFetch('/api/admin/finder-details')

if (finderDetailsError.value) {
  throw finderDetailsError.value
}

const sources = Object.values(finderDetails.value?.sources || {})

const formValue = ref<FormData>(props.mediaQuery ?? {
  requestOptions: {
    source: null,
    queryType: null,
  },
  fetchCountLimit: null,
})

const selectedSourceId = computed(() => {
  const source = formValue.value.requestOptions.source
  return typeof source === 'string' ? source : ''
})

const requestHandlers = computed(() => {
  return finderDetails.value?.sources[selectedSourceId.value]?.requestHandlers
})

const requestOptions = computed<SchemaOption[]>(() => {
  const schema = finderDetails.value?.sources[selectedSourceId.value]
    ?.requestHandlers.find(handler => handler.id === formValue.value.requestOptions.queryType)
    ?.schema

  return schema && isJsonSchemaWithProperties(schema) ? convertJSONSchemaToListOfOptions(schema) : []
})

const formattedFormValue = computed(() => ({
  ...formValue.value,
  requestOptions: Object.fromEntries(
    Object.entries(formValue.value.requestOptions).filter(([, value]) => value !== null),
  ),
}))

function getStringOption(name: string): string | null | undefined {
  const val = formValue.value.requestOptions[name]
  if (typeof val === 'string' || val === null || val === undefined) return val
  return undefined
}

function getNumberOption(name: string): number | null | undefined {
  const val = formValue.value.requestOptions[name]
  if (typeof val === 'number' || val === null || val === undefined) return val
  return undefined
}

function getJsonOption(name: string): string | undefined {
  const val = formValue.value.requestOptions[name]
  if (typeof val === 'string' || val === undefined) return val
  if (val === null) return undefined
  return JSON.stringify(val)
}

function getArrayOption(name: string): string[] | undefined {
  const val = formValue.value.requestOptions[name]
  if (!Array.isArray(val)) return undefined
  return val.filter((item): item is string => typeof item === 'string')
}

function setOption(name: string, value: unknown): void {
  formValue.value.requestOptions[name] = value
}

function isJsonSchemaWithProperties(schema: unknown): schema is JsonSchemaWithProperties {
  return typeof schema === 'object' && schema !== null && 'properties' in schema
}

function convertJSONSchemaToListOfOptions(schema: JsonSchemaWithProperties): SchemaOption[] {
  const { source, queryType, ...otherOptions } = schema.properties
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
        location.hash = `#query-${mediaQuery?.id}`
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
    toast.add({ severity: 'error', summary: 'Failed', detail: error instanceof Error ? error.message : String(error), life: 3000 })
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
