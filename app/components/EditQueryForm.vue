<template>
  <form @submit.prevent="handleValidateClick">    
    <div class="top-section">
      <div class="primary-options fields-list">
        <div class="option">
          <label for="sourceInput">Source</label>
          <Select
            data-testid="source-select"
            input-id="sourceInput"
            input-class="field-input"
            :loading="loading"
            v-model="formValue.requestOptions.source"
            :options="sources"
            option-label="name"
            option-value="id"
          />
        </div>
        <div class="option">
          <label for="requestHandlerInput">Request Handler</label>
          <Select
            input-id="requestHandlerInput"
            input-class="field-input"
            :loading="loading"
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

      <div class="query-actions">
        <Button
          type="button"
          outlined
          @click="copyQuery($event)"
        >
          <Copy :size="16" />
          Copy
        </Button>
        <Popover ref="copyPopoverRef">Copied!</Popover>
        <Button
          type="button"
          outlined
          @click="showImportDialog = true"
        >
          <Download :size="16" />
          Import
        </Button>
      </div>
    </div>
    <div
      v-if="requestOptions.length > 0"
      class="request-options"
    >
      <h2>Request Options</h2>
      <ul class="fields-list">
        <li
          v-for="option in requestOptions"
          :key="`${formValue.requestOptions.source} - ${formValue.requestOptions.queryType} - ${option.name}`"
        >
          <div
            class="option"
            :class="{ 'variation-controlled': variationControlledFields.has(option.name) }"
          >
            <label :for="option.name">{{ camelCaseToTitleCase(option.name) }}</label>
            <InputGroup class="field-input">
              <Select
                v-if="option.type === 'string' && option.enum"
                :input-id="option.name"
                v-model="formValue.requestOptions[option.name]"
                :options="option.enum"
                :disabled="variationControlledFields.has(option.name)"
                :placeholder="variationControlledFields.has(option.name) ? 'Set in a variation' : ''"
              />
              <InputText
                v-else-if="option.type === 'string'"
                :id="option.name"
                :model-value="getStringOption(option.name)"
                :placeholder="variationControlledFields.has(option.name) ? 'Set in a variation' : ''"
                type="text"
                :disabled="variationControlledFields.has(option.name)"
                @update:model-value="setOption(option.name, $event)"
              />
              <InputNumber
                v-else-if="option.type === 'number'"
                :id="option.name"
                :model-value="getNumberOption(option.name)"
                :placeholder="variationControlledFields.has(option.name) ? 'Set in a variation' : ''"
                show-buttons
                :disabled="variationControlledFields.has(option.name)"
                @update:model-value="setOption(option.name, $event)"
                />
              <JsonInput
                v-else-if="option.type === 'object'"
                :id="option.name"
                :placeholder="variationControlledFields.has(option.name) ? 'Set in a variation' : ''"
                :model-value="getJsonOption(option.name)"
                rows="5"
                cols="30"
                :disabled="variationControlledFields.has(option.name)"
                @update:model-value="setOption(option.name, $event)"
              />
              
              <InputGroupAddon v-else-if="option.type === 'boolean'">
                <Checkbox
                  v-if="!variationControlledFields.has(option.name)"
                  v-model="formValue.requestOptions[option.name]"
                  :binary="true"
                  :input-id="option.name"
                />
                <span v-else>Field is set in a query variation</span>
              </InputGroupAddon>
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
              <InputGroupAddon
                v-if="!variationControlledFields.has(option.name)"
                class="variation-btn-addon"
              >
                <Button
                  type="button"
                  title="Add to new variation"
                  severity="secondary"
                  text
                  @click="addFieldToNewVariation(option.name)"
                >
                  <Split :size="18" style="transform: rotate(90deg)" />
                </Button>
              </InputGroupAddon>
            </InputGroup>
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
        Each variation runs a separate query for every combination of its field values.
      </p>
      <QueryVariationCard
        v-for="(variation, vIdx) in formValue.queryVariations"
        :key="variation.id"
        :variation="variation"
        :request-options="requestOptions"
        @remove="removeVariation(vIdx)"
        @add-field="addFieldToVariation(vIdx, $event)"
      />
      <Button
        type="button"
        class="add-variation-btn-secondary"
        severity="secondary"
        text
        @click="addVariation()"
      >
        <Plus :size="16" />
        Add variation
      </Button>
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
      <div
        v-if="formValue.queryVariations && formValue.queryVariations.length > 0"
        class="option"
      >
        <label for="fetchCountLimitPerVariation">Limit per query variation</label>
        <Checkbox
          v-model="formValue.fetchCountLimitPerVariation"
          input-id="fetchCountLimitPerVariation"
          :binary="true"
        />
      </div>
    </div>

    <Button type="submit">
      Save
    </Button>
  </form>

  <Dialog
    v-model:visible="showImportDialog"
    header="Import Query"
    modal
    :style="{ width: '500px' }"
  >
    <p style="margin: 0 0 0.75rem">Paste a previously copied query JSON below:</p>
    <Textarea
      v-model="importJson"
      rows="14"
      style="width: 100%; font-family: monospace; font-size: 0.85em"
      autofocus
    />
    <p v-if="importError" class="import-error">{{ importError }}</p>
    <template #footer>
      <Button label="Cancel" severity="secondary" @click="showImportDialog = false" />
      <Button label="Import" @click="importQuery" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import type { LiaseQuery, QueryVariation } from "@@/server/database/schema";
import { useUiState } from "@@/stores/ui";
import { Copy, Download, Plus, Split } from "lucide-vue-next";
import JsonInput from "./forms/JsonInput.vue";
import TextList from "./forms/TextList.vue";

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
    LiaseQuery,
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
    LiaseQuery,
    "requestOptions" | "createdAt" | "updatedAt"
  > & {
    requestOptions: Record<string, unknown>;
    queryVariations?: QueryVariation[] | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };
  loading?: boolean;
}>();

const toast = useToast();

const uiState = useUiState();

const { data: liaseDetails, error: liaseDetailsError } = await useFetch(
  "/api/admin/liase-details",
  { server: false },
);

watch(liaseDetailsError, (error) => {
  if (!error) return;
  console.error("Error fetching liase details:", error);
  throw liaseDetailsError.value;
});

const sources = computed(() =>
  Object.values(liaseDetails.value?.sources || {}),
);

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
        fetchCountLimit: 1000,
        fetchCountLimitPerVariation: true,
      },
);

// When the page uses server:false for its fetch, mediaQuery arrives after
// mount. Watch for the first non-undefined value and initialise formValue.
watch(
  () => props.mediaQuery,
  (mediaQuery) => {
    if (!mediaQuery) return;
    formValue.value = {
      ...mediaQuery,
      queryVariations: mediaQuery.queryVariations ?? [],
    };
  },
  { once: true },
);

const selectedSourceId = computed(() => {
  const source = formValue.value.requestOptions.source;
  return typeof source === "string" ? source : "";
});

const requestHandlers = computed(() => {
  return liaseDetails.value?.sources[selectedSourceId.value]?.requestHandlers;
});

const requestOptions = computed<SchemaOption[]>(() => {
  const schema = liaseDetails.value?.sources[
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
  let initialValues: unknown[];
  if (option?.type === "boolean") {
    const current = formValue.value.requestOptions[fieldName];
    initialValues = current === true ? [true, false] : [false, true];
    formValue.value.requestOptions[fieldName] = null;
  } else {
    initialValues = [defaultValueForOption(option)];
    transferBaseValueToVariation(fieldName, initialValues);
  }

  const lastVariation = formValue.value.queryVariations.at(-1);
  if (lastVariation && !lastVariation.fieldOverrides[fieldName]) {
    lastVariation.fieldOverrides[fieldName] = initialValues;
  } else {
    formValue.value.queryVariations.push({
      id: generateVariationId(),
      fieldOverrides: { [fieldName]: initialValues },
    });
  }
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

// --- Copy / Import ---

const copyPopoverRef = ref();

async function copyQuery(event: MouseEvent) {
  try {
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      title: _title,
      ...exportValue
    } = formattedFormValue.value;
    const json = JSON.stringify(exportValue, null, 2);
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(json);
    } else {
      const el = document.createElement("textarea");
      el.value = json;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
  } catch (error) {
    console.error(error);
  }
  copyPopoverRef.value?.show(event);
  setTimeout(() => {
    copyPopoverRef.value?.hide();
  }, 2000);
}

const showImportDialog = ref(false);
const importJson = ref("");
const importError = ref<string | null>(null);

function importQuery() {
  try {
    const parsed = JSON.parse(importJson.value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      importError.value = "Invalid JSON: expected an object";
      return;
    }
    if (parsed.requestOptions && typeof parsed.requestOptions === "object") {
      formValue.value.requestOptions = parsed.requestOptions;
    }
    if (Array.isArray(parsed.queryVariations)) {
      formValue.value.queryVariations = parsed.queryVariations;
    }
    if (
      typeof parsed.fetchCountLimit === "number" ||
      parsed.fetchCountLimit === null
    ) {
      formValue.value.fetchCountLimit = parsed.fetchCountLimit;
    }
    showImportDialog.value = false;
    importJson.value = "";
    importError.value = null;
  } catch (e) {
    importError.value = e instanceof Error ? e.message : "Invalid JSON";
  }
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
  .query-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-top: 0.25rem;
    justify-content: end;

    .p-button {
      display: flex;
      gap: 0.4em;
      align-items: center;
      white-space: nowrap;
    }
  }

  .import-error {
    color: var(--p-message-error-color);
    margin: 0.5rem 0 0;
    font-size: 0.9em;
  }

  form {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2em;
    
    
    .top-section {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
      justify-content: space-between;
      width: 100%;

      .primary-options {
        :deep(.p-inputwrapper) {
          max-width: 100%;
          
          :deep(.p-select-label) {
            width: 200px; /* this shrinks if needed */
          }
        }
      }
    }
    
    
    .fields-list {
      display: grid;
      grid-template-columns: 100%;
      gap: 1em;
      align-self: stretch;

      @media (min-width: 850px) {
        grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      }
    }

    .option {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.75em;

      label {
        width: 8em;
        text-align: right;
        flex-shrink: 0;
      }
      
      @media (max-width: 600px) {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25em;
        
        label {
          width: auto;
          text-align: left;
        }
      }
      
      .field-input {
        max-width: 20em;
      }

      --height-of-input: calc(2px + (var(--p-form-field-padding-y) * 2) + 1lh); /* 2px for border */

      :deep(input[type="text"]) {
        min-width: 200px;
        field-sizing: content;
        padding-right: 2em;
      }

      .variation-btn-addon {
        padding: 0;

        .p-button {
          height: 100%;
          border-radius: 0;
        }
      }
    }

    .request-options {
      align-self: stretch;
      flex-direction: column;

      ul {
        list-style-type: none;
        padding-left: 0;
        margin: 0.5em 0;
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
    }


    .option.variation-controlled,
    span.variation-controlled {
      opacity: 0.45;
      pointer-events: none;
    }
  }
</style>
