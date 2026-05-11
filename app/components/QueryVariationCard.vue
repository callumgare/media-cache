<template>
  <div class="variation">
    <div class="variation-header">
      <span class="variation-summary">{{ variationQuerySummary() }}</span>
      <Inplace
        v-if="variationNeedsRemoveConfirmation()"
        class="remove-variation-inplace"
      >
        <template #display>
          <Button type="button" class="remove-btn" severity="danger" text>
            <template #icon><Trash2 :size="18" /></template>
          </Button>
        </template>
        <template #content="{ closeCallback }">
          <span class="remove-variation-confirm">
            <span>Are you sure?</span>
            <Button
              type="button"
              severity="danger"
              size="small"
              text
              @click="emit('remove')"
            >
              <Trash2 :size="14" />
            </Button>
            <Button
              type="button"
              severity="secondary"
              text
              size="small"
              @click="closeCallback()"
            >
              <X :size="14" />
            </Button>
          </span>
        </template>
      </Inplace>
      <Button
        v-else
        type="button"
        class="remove-btn"
        severity="danger"
        text
        @click="emit('remove')"
      >
        <template #icon><Trash2 :size="18" /></template>
      </Button>
    </div>
    <div class="variation-body">
      <Fieldset
        v-for="fieldName in Object.keys(variation.fieldOverrides)"
        :key="fieldName"
        class="variation-field"
      >
        <template #legend>
          <div class="variation-field-legend">
            <span>{{ camelCaseToTitleCase(fieldName) }}</span>
            <Inplace
              v-if="(variation.fieldOverrides[fieldName] ?? []).length > 3"
              class="remove-all-inplace"
            >
              <template #display>
                <Button type="button" severity="danger" text size="small">
                  <Trash2 :size="14" />
                </Button>
              </template>
              <template #content="{ closeCallback }">
                <span class="remove-all-confirm">
                  <span>Are you sure?</span>
                  <Button
                    type="button"
                    severity="danger"
                    size="small"
                    text
                    @click="removeFieldFromVariation(fieldName)"
                  >
                    <Trash2 :size="14" />
                  </Button>
                  <Button
                    type="button"
                    severity="secondary"
                    text
                    size="small"
                    @click="closeCallback()"
                  >
                    <X :size="14" />
                  </Button>
                </span>
              </template>
            </Inplace>
            <Button
              v-else
              type="button"
              severity="danger"
              text
              size="small"
              @click="removeFieldFromVariation(fieldName)"
            >
              <Trash2 :size="14" />
            </Button>
          </div>
        </template>
          <div
            class="variation-field-values"
            :ref="(el) => setFieldValuesContainerRef(fieldName, el)"
          >
          <InputGroup
            v-for="(_, valueIdx) in variation.fieldOverrides[fieldName] ?? []"
            :key="valueIdx"
            class="variation-value-row"
          >
            <VariationFieldInput
              :option="getOptionByName(fieldName)"
              :model-value="(variation.fieldOverrides[fieldName] ?? [])[valueIdx]"
              @update:model-value="setVariationFieldValue(fieldName, valueIdx, $event)"
              @confirm="focusAddValueBtn(fieldName)"
            />
            <InputGroupAddon class="remove-value-addon">
              <Button
                type="button"
                class="remove-btn"
                severity="secondary"
                text
                @click="removeVariationFieldValue(fieldName, valueIdx)"
              >
                <X :size="16" />
              </Button>
            </InputGroupAddon>
          </InputGroup>
          <div class="value-actions">
            <Button
              v-if="!(getOptionByName(fieldName)?.type === 'boolean' && (variation.fieldOverrides[fieldName] ?? []).length >= 2)"
              :ref="(el) => setAddValueBtnRef(fieldName, el)"
              type="button"
              class="add-value-btn"
              severity="secondary"
              text
              @click="addVariationFieldValue(fieldName)"
            >
              <Plus :size="16" />
              Add value
            </Button>
          </div>
        </div>
      </Fieldset>
      <div
        v-if="availableFields.length > 0"
        class="add-field-row"
      >
        <Select
          :options="availableFields"
          option-label="label"
          option-value="value"
          placeholder="Add field to variation…"
          @update:model-value="emit('add-field', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { QueryVariation } from "@@/server/database/schema";
import { Plus, Trash2, X } from "lucide-vue-next";
import VariationFieldInput from "./forms/VariationFieldInput.vue";

type SchemaOption = {
  name: string;
  type?: string;
  enum?: unknown[];
  items?: { type?: string };
  [key: string]: unknown;
};

const props = defineProps<{
  variation: QueryVariation;
  requestOptions: SchemaOption[];
}>();

const emit = defineEmits<{
  remove: [];
  "add-field": [fieldName: string];
}>();

function camelCaseToTitleCase(s: string) {
  const result = s.replace(/([A-Z])/g, " $1");
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function getOptionByName(name: string): SchemaOption | undefined {
  return props.requestOptions.find((opt) => opt.name === name);
}

function defaultValueForOption(option: SchemaOption | undefined): unknown {
  if (!option) return "";
  if (option.type === "number") return null;
  if (option.type === "boolean") return false;
  if (option.type === "array") return [];
  return "";
}

function variationNeedsRemoveConfirmation(): boolean {
  const entries = Object.entries(props.variation.fieldOverrides);
  if (entries.length > 3) return true;
  return entries.some(([, values]) => (values ?? []).length > 3);
}

function variationQuerySummary(): string {
  const entries = Object.entries(props.variation.fieldOverrides);
  if (entries.length === 0) return "No fields configured";
  const parts = entries.map(
    ([name, values]) =>
      `${(values ?? []).length} ${camelCaseToTitleCase(name).toLocaleLowerCase()} field${(values ?? []).length === 1 ? "" : "s"}`,
  );
  const total = entries.reduce(
    (acc, [, values]) => acc * (values ?? []).length,
    1,
  );
  return `Produces ${total} quer${total === 1 ? "y" : "ies"} from ${parts.join(" × ")}`;
}

const addValueBtnRefs = new Map<string, HTMLButtonElement>();
const fieldValuesContainerRefs = new Map<string, HTMLElement>();

function setAddValueBtnRef(fieldName: string, el: unknown) {
  if (el) {
    const btn = ((el as { $el?: HTMLElement }).$el ?? el) as HTMLButtonElement;
    addValueBtnRefs.set(fieldName, btn);
  } else {
    addValueBtnRefs.delete(fieldName);
  }
}

function setFieldValuesContainerRef(fieldName: string, el: unknown) {
  if (el) {
    fieldValuesContainerRefs.set(fieldName, el as HTMLElement);
  } else {
    fieldValuesContainerRefs.delete(fieldName);
  }
}

function focusAddValueBtn(fieldName: string) {
  addValueBtnRefs.get(fieldName)?.focus();
}

const availableFields = computed(() => {
  const existing = Object.keys(props.variation.fieldOverrides);
  return props.requestOptions
    .filter((opt) => !existing.includes(opt.name))
    .map((opt) => ({ label: camelCaseToTitleCase(opt.name), value: opt.name }));
});

function removeFieldFromVariation(fieldName: string) {
  if (Object.keys(props.variation.fieldOverrides).length === 1) {
    emit("remove");
  } else {
    delete props.variation.fieldOverrides[fieldName];
  }
}

async function addVariationFieldValue(fieldName: string) {
  const option = getOptionByName(fieldName);
  const values = props.variation.fieldOverrides[fieldName];
  if (!values) return;
  values.push(defaultValueForOption(option));
  await nextTick();
  const container = fieldValuesContainerRefs.get(fieldName);
  if (!container) return;
  const rows = container.querySelectorAll<HTMLElement>(".variation-value-row");
  const lastRow = rows[rows.length - 1];
  const input = lastRow?.querySelector<HTMLElement>("input");
  input?.focus();
}

function removeVariationFieldValue(fieldName: string, valueIdx: number) {
  const values = props.variation.fieldOverrides[fieldName];
  if (!values) return;
  values.splice(valueIdx, 1);
  if (values.length === 0) {
    removeFieldFromVariation(fieldName);
  }
}

function setVariationFieldValue(
  fieldName: string,
  valueIdx: number,
  value: unknown,
) {
  const values = props.variation.fieldOverrides[fieldName];
  if (!values) return;
  values[valueIdx] = value;
}
</script>

<style scoped>
.variation {
  position: relative;
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

    .variation-summary {
      font-size: 0.85em;
      opacity: 0.65;
    }

    .remove-btn,
    .remove-variation-inplace {
      position: absolute;
      top: 0.25em;
      right: 0.25em;
    }

    .remove-variation-inplace {
      :deep(.p-inplace-display) {
        padding: 0;
      }

      .remove-variation-confirm {
        display: flex;
        align-items: center;
        gap: 0.4em;
        font-size: 0.85em;
      }
    }
  }

  .variation-body {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5em;

    .variation-field {
      display: flex;
      flex-direction: column;
      gap: 0.4em;

      :deep(.p-fieldset-legend) {
        font-size: 0.9em;
        padding: 0.3em 0.6em;
      }

      .variation-field-legend {
        display: flex;
        align-items: center;
        gap: 0.25em;
      }

      :deep(.p-fieldset-content) {
        padding: 0.5em;
      }

      .variation-field-values {
        display: flex;
        flex-direction: column;
        gap: 0.3em;

        .variation-value-row {
          width: fit-content;

          .remove-value-addon {
            padding: 0;

            .remove-btn {
              height: 100%;
              border-radius: 0;
            }
          }
        }

        .value-actions {
          display: flex;
          align-items: center;
          gap: 0.5em;
          flex-wrap: wrap;
          margin-top: 0.1em;
        }

        .remove-all-inplace {
          :deep(.p-inplace-display) {
            padding: 0;
          }

          .remove-all-display {
            font-size: 0.85em;
            cursor: pointer;
          }

          .remove-all-confirm {
            display: flex;
            align-items: center;
            gap: 0.4em;
            font-size: 0.85em;
          }
        }
      }
    }

    .add-field-row {
      margin-top: 0.25em;
    }
  }
}
</style>
