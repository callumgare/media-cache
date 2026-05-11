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
            class="option"
            :class="{ 'variation-controlled': variationControlledFields.has(option.name) }"
          >
            <label :for="option.name">{{ camelCaseToTitleCase(option.name) }}</label>
            <Select
              v-if="option.type === 'string' && option.enum"
              v-model="formValue.requestOptions[option.name]"
              :options="option.enum"
              :disabled="variationControlledFields.has(option.name)"
            />
            <InputText
              v-else-if="option.type === 'string'"
              :id="option.name"
              :model-value="getStringOption(option.name)"
              placeholder=""
              type="text"
              :disabled="variationControlledFields.has(option.name)"
              @update:model-value="setOption(option.name, $event)"
            />
            <InputNumber
              v-else-if="option.type === 'number'"
              :id="option.name"
              :model-value="getNumberOption(option.name)"
              placeholder=""
              show-buttons
              :disabled="variationControlledFields.has(option.name)"
              @update:model-value="setOption(option.name, $event)"
            />
            <JsonInput
              v-else-if="option.type === 'object'"
              :id="option.name"
              :model-value="getJsonOption(option.name)"
              rows="5"
              cols="30"
              :disabled="variationControlledFields.has(option.name)"
              @update:model-value="setOption(option.name, $event)"
            />
            <Checkbox
              v-else-if="option.type === 'boolean'"
              v-model="formValue.requestOptions[option.name]"
              :binary="true"
              :input-id="option.name"
              :disabled="variationControlledFields.has(option.name)"
            />
            <TextList
              v-else-if="option.type === 'array' && option.items?.type === 'string'"
              :model-value="getArrayOption(option.name)"
              name="fdsafasf"
              :disabled="variationControlledFields.has(option.name)"
              @update:model-value="setOption(option.name, $event)"
            />
            <template v-else>
              Option type "{{ option.type }}" is unknown.
              <pre v-if="uiState.debugMode">{{ JSON.stringify(option, null, 2) }}</pre>
              <JsonInput
                :id="option.name"
                :model-value="getJsonOption(option.name)"
                rows="5"
                cols="30"
                :disabled="variationControlledFields.has(option.name)"
                @update:model-value="setOption(option.name, $event)"
              />
            </template>
            <button
              v-if="!variationControlledFields.has(option.name)"
              type="button"
              class="add-variation-btn"
              title="Add to new variation"
              @click="addFieldToNewVariation(option.name)"
            >
              ±
            </button>
            <span v-else>Field is set in a query variation</span>
          </div>
        </li>
      </ul>
    </div>

    <div
      v-if="formValue.queryVariations && formValue.queryVariations.length > 0"
      class="query-variations"
    >
      <h2>Query Variations</h2>
      <p class="variations-hint">
        Each variation generates a cartesian product of its field values and runs as separate queries within the same execution.
      </p>
      <div
        v-for="(variation, vIdx) in formValue.queryVariations"
        :key="variation.id"
        class="variation"
      >
        <div class="variation-header">
          <h3>Variation {{ vIdx + 1 }}</h3>
          <button
            type="button"
            class="remove-btn"
            @click="removeVariation(vIdx)"
          >
            Remove variation
          </button>
        </div>
        <div
          v-for="fieldName in Object.keys(variation.fieldOverrides)"
          :key="fieldName"
          class="variation-field"
        >
          <div class="variation-field-header">
            <span class="variation-field-name">{{ camelCaseToTitleCase(fieldName) }}</span>
            <button
              type="button"
              class="remove-btn"
              @click="removeFieldFromVariation(vIdx, fieldName)"
            >
              Remove field
            </button>
          </div>
          <div class="variation-field-values">
            <div
              v-for="(_, valueIdx) in variation.fieldOverrides[fieldName] ?? []"
              :key="valueIdx"
              class="variation-value-row"
            >
              <VariationFieldInput
                :option="getOptionByName(fieldName)"
                :model-value="(variation.fieldOverrides[fieldName] ?? [])[valueIdx]"
                @update:model-value="setVariationFieldValue(vIdx, fieldName, valueIdx, $event)"
              />
              <button
                type="button"
                class="remove-btn"
                @click="removeVariationFieldValue(vIdx, fieldName, valueIdx)"
              >
                ×
              </button>
            </div>
            <button
              v-if="!(getOptionByName(fieldName)?.type === 'boolean' && (variation.fieldOverrides[fieldName] ?? []).length >= 2)"
              type="button"
              class="add-value-btn"
              @click="addVariationFieldValue(vIdx, fieldName)"
            >
              + Add value
            </button>
          </div>
        </div>
        <div
          v-if="availableFieldsForVariation(vIdx).length > 0"
          class="add-field-row"
        >
          <Select
            :options="availableFieldsForVariation(vIdx)"
            option-label="label"
            option-value="value"
            placeholder="Add field to variation…"
            @update:model-value="addFieldToVariation(vIdx, $event)"
          />
        </div>
      </div>
      <button
        type="button"
        class="add-variation-btn-secondary"
        @click="addVariation()"
      >
        + Add variation
      </button>
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
import type { FinderQuery, QueryVariation } from "@@/server/database/schema";
import { useUiState } from "@@/stores/ui";
import JsonInput from "./forms/JsonInput.vue";
import TextList from "./forms/TextList.vue";
import VariationFieldInput from "./forms/VariationFieldInput.vue";

type JsonSchemaWithProperties = {
  properties: Record<string, Record<string, unknown>>;
};

type SchemaOption = {
  name: string;
  type?: string;
  enum?: unknown[];
  items?: { type?: string };
  [key: string]: unknown;
};

type FormData = Partial<
  Omit<
    FinderQuery,
    "requestOptions" | "createdAt" | "updatedAt" | "queryVariations"
  >
> & {
  requestOptions: Record<string, unknown>;
  queryVariations: QueryVariation[];
  id?: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

const props = defineProps<{
  mediaQuery?: Omit<
    FinderQuery,
    "requestOptions" | "createdAt" | "updatedAt"
  > & {
    requestOptions: Record<string, unknown>;
    queryVariations?: QueryVariation[] | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };
}>();

const toast = useToast();

const uiState = useUiState();

const { data: finderDetails, error: finderDetailsError } = await useFetch(
  "/api/admin/finder-details",
);

if (finderDetailsError.value) {
  throw finderDetailsError.value;
}

const sources = Object.values(finderDetails.value?.sources || {});

const formValue = ref<FormData>(
  props.mediaQuery
    ? {
        ...props.mediaQuery,
        queryVariations: props.mediaQuery.queryVariations ?? [],
      }
    : {
        requestOptions: {
          source: null,
          queryType: null,
        },
        queryVariations: [],
        fetchCountLimit: null,
      },
);

const selectedSourceId = computed(() => {
  const source = formValue.value.requestOptions.source;
  return typeof source === "string" ? source : "";
});

const requestHandlers = computed(() => {
  return finderDetails.value?.sources[selectedSourceId.value]?.requestHandlers;
});

const requestOptions = computed<SchemaOption[]>(() => {
  const schema = finderDetails.value?.sources[
    selectedSourceId.value
  ]?.requestHandlers.find(
    (handler) => handler.id === formValue.value.requestOptions.queryType,
  )?.schema;

  return schema && isJsonSchemaWithProperties(schema)
    ? convertJSONSchemaToListOfOptions(schema)
    : [];
});

const knownRequestOptionNames = computed(() => {
  const fixed = new Set(["source", "queryType"]);
  for (const opt of requestOptions.value) fixed.add(opt.name);
  return fixed;
});

const formattedFormValue = computed(() => ({
  ...formValue.value,
  requestOptions: Object.fromEntries(
    Object.entries(formValue.value.requestOptions).filter(
      ([key, value]) =>
        value !== null && knownRequestOptionNames.value.has(key),
    ),
  ),
  queryVariations:
    formValue.value.queryVariations.length > 0
      ? formValue.value.queryVariations
      : null,
}));

function getStringOption(name: string): string | null | undefined {
  const val = formValue.value.requestOptions[name];
  if (typeof val === "string" || val === null || val === undefined) return val;
  return undefined;
}

function getNumberOption(name: string): number | null | undefined {
  const val = formValue.value.requestOptions[name];
  if (typeof val === "number" || val === null || val === undefined) return val;
  return undefined;
}

function getJsonOption(name: string): string | undefined {
  const val = formValue.value.requestOptions[name];
  if (typeof val === "string" || val === undefined) return val;
  if (val === null) return undefined;
  return JSON.stringify(val);
}

function getArrayOption(name: string): string[] | undefined {
  const val = formValue.value.requestOptions[name];
  if (!Array.isArray(val)) return undefined;
  return val.filter((item): item is string => typeof item === "string");
}

function setOption(name: string, value: unknown): void {
  formValue.value.requestOptions[name] = value;
}

function isJsonSchemaWithProperties(
  schema: unknown,
): schema is JsonSchemaWithProperties {
  return (
    typeof schema === "object" && schema !== null && "properties" in schema
  );
}

function convertJSONSchemaToListOfOptions(
  schema: JsonSchemaWithProperties,
): SchemaOption[] {
  const { source, queryType, ...otherOptions } = schema.properties;
  return Object.entries(otherOptions).map(([name, value]) => ({
    name,
    ...value,
  }));
}

function getOptionByName(name: string): SchemaOption | undefined {
  return requestOptions.value.find((opt) => opt.name === name);
}

function camelCaseToTitleCase(s: string) {
  const result = s.replace(/([A-Z])/g, " $1");
  return result.charAt(0).toUpperCase() + result.slice(1);
}

// --- Variation management ---

function generateVariationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultValueForOption(option: SchemaOption | undefined): unknown {
  if (!option) return "";
  if (option.type === "number") return null;
  if (option.type === "boolean") return false;
  if (option.type === "array") return [];
  return "";
}

/** Set of field names that appear in at least one variation. */
const variationControlledFields = computed<Set<string>>(() => {
  const names = new Set<string>();
  for (const v of formValue.value.queryVariations) {
    for (const key of Object.keys(v.fieldOverrides)) {
      names.add(key);
    }
  }
  return names;
});

/** Transfer the current base value into the variation's initial value list. */
function transferBaseValueToVariation(fieldName: string, values: unknown[]) {
  const current = formValue.value.requestOptions[fieldName];
  if (current !== null && current !== undefined) {
    values[0] = current;
    formValue.value.requestOptions[fieldName] = null;
  }
}

function addFieldToNewVariation(fieldName: string) {
  const option = getOptionByName(fieldName);
  const initialValues = [defaultValueForOption(option)];
  transferBaseValueToVariation(fieldName, initialValues);
  const variation: QueryVariation = {
    id: generateVariationId(),
    fieldOverrides: {
      [fieldName]: initialValues,
    },
  };
  formValue.value.queryVariations.push(variation);
}

function addVariation() {
  formValue.value.queryVariations.push({
    id: generateVariationId(),
    fieldOverrides: {},
  });
}

function removeVariation(vIdx: number) {
  formValue.value.queryVariations.splice(vIdx, 1);
}

function addFieldToVariation(vIdx: number, fieldName: string) {
  const option = getOptionByName(fieldName);
  const variation = formValue.value.queryVariations[vIdx];
  if (!variation) return;
  if (!variation.fieldOverrides[fieldName]) {
    const initialValues = [defaultValueForOption(option)];
    transferBaseValueToVariation(fieldName, initialValues);
    variation.fieldOverrides[fieldName] = initialValues;
  }
}

function removeFieldFromVariation(vIdx: number, fieldName: string) {
  const variation = formValue.value.queryVariations[vIdx];
  if (!variation) return;
  const { [fieldName]: _, ...rest } = variation.fieldOverrides;
  variation.fieldOverrides = rest;
}

function addVariationFieldValue(vIdx: number, fieldName: string) {
  const option = getOptionByName(fieldName);
  const values =
    formValue.value.queryVariations[vIdx]?.fieldOverrides[fieldName];
  if (!values) return;
  values.push(defaultValueForOption(option));
}

function removeVariationFieldValue(
  vIdx: number,
  fieldName: string,
  valueIdx: number,
) {
  const values =
    formValue.value.queryVariations[vIdx]?.fieldOverrides[fieldName];
  if (!values) return;
  values.splice(valueIdx, 1);
}

function setVariationFieldValue(
  vIdx: number,
  fieldName: string,
  valueIdx: number,
  value: unknown,
) {
  const values =
    formValue.value.queryVariations[vIdx]?.fieldOverrides[fieldName];
  if (!values) return;
  values[valueIdx] = value;
}

function availableFieldsForVariation(vIdx: number) {
  const existing = Object.keys(
    formValue.value.queryVariations[vIdx]?.fieldOverrides ?? {},
  );
  return requestOptions.value
    .filter((opt) => !existing.includes(opt.name))
    .map((opt) => ({ label: camelCaseToTitleCase(opt.name), value: opt.name }));
}

async function handleValidateClick() {
  try {
    if (!formattedFormValue.value.id) {
      const mediaQuery = await $fetch("/api/admin/queries", {
        method: "POST",
        body: {
          title: "fake title",
          schedule: 0,
          ...formattedFormValue.value,
        },
      });
      toast.add({ severity: "success", summary: "Created", life: 3000 });
      await navigateTo("/admin/queries");
      setTimeout(() => {
        location.hash = `#query-${mediaQuery?.id}`;
      }, 200);
    } else {
      await $fetch(`/api/admin/queries/${formattedFormValue.value.id}`, {
        method: "POST",
        body: {
          title: "fake title",
          schedule: 0,
          ...formattedFormValue.value,
        },
      });
      toast.add({ severity: "success", summary: "Updated", life: 6000 });
      await navigateTo("/admin/queries");
      setTimeout(() => {
        location.hash = `#query-${formattedFormValue.value.id}`;
      }, 200);
    }
  } catch (error) {
    console.error(error);
    toast.add({
      severity: "error",
      summary: "Failed",
      detail: error instanceof Error ? error.message : String(error),
      life: 3000,
    });
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

    .add-variation-btn {
      margin-top: 0.3em;
      align-self: flex-start;
      font-size: 1rem;
      background: none;
      border: 1px solid var(--p-content-border-color, #ccc);
      border-radius: 4px;
      cursor: pointer;
      padding: 0.1em 0.4em;
      color: inherit;
      opacity: 0.6;

      &:hover {
        opacity: 1;
      }
    }

    .query-variations {
      display: flex;
      flex-direction: column;
      gap: 1em;
      align-self: stretch;

      .variations-hint {
        margin: 0;
        font-size: 0.85em;
        opacity: 0.7;
      }

      .variation {
        border: 1px solid var(--p-content-border-color, #ccc);
        border-radius: 6px;
        padding: 1em;
        display: flex;
        flex-direction: column;
        gap: 0.75em;

        .variation-header {
          display: flex;
          align-items: center;
          gap: 1em;

          h3 {
            margin: 0;
            font-size: 1em;
          }
        }

        .variation-field {
          display: flex;
          flex-direction: column;
          gap: 0.4em;

          .variation-field-header {
            display: flex;
            align-items: center;
            gap: 0.75em;

            .variation-field-name {
              font-weight: 600;
              font-size: 0.9em;
            }
          }

          .variation-field-values {
            display: flex;
            flex-direction: column;
            gap: 0.3em;
            padding-left: 1em;

            .variation-value-row {
              display: flex;
              align-items: center;
              gap: 0.5em;
            }
          }
        }

        .add-field-row {
          margin-top: 0.25em;
        }
      }

      .add-variation-btn-secondary {
        align-self: flex-start;
        background: none;
        border: 1px dashed var(--p-content-border-color, #ccc);
        border-radius: 4px;
        cursor: pointer;
        padding: 0.3em 0.75em;
        color: inherit;
        opacity: 0.7;

        &:hover {
          opacity: 1;
        }
      }
    }

    .remove-btn {
      background: none;
      border: 1px solid var(--p-content-border-color, #ccc);
      border-radius: 4px;
      cursor: pointer;
      padding: 0.1em 0.4em;
      font-size: 0.8em;
      color: inherit;
      opacity: 0.6;

      &:hover {
        opacity: 1;
        border-color: var(--p-red-400, #f87171);
        color: var(--p-red-400, #f87171);
      }
    }

    .add-value-btn {
      align-self: flex-start;
      background: none;
      border: 1px dashed var(--p-content-border-color, #ccc);
      border-radius: 4px;
      cursor: pointer;
      padding: 0.1em 0.5em;
      font-size: 0.85em;
      color: inherit;
      opacity: 0.6;
      margin-top: 0.2em;

      &:hover {
        opacity: 1;
      }
    }

    .option.variation-controlled,
    span.variation-controlled {
      opacity: 0.45;
      pointer-events: none;
    }
  }
</style>
