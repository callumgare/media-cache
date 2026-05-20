<template>
  <Dialog
    :visible="visible"
    :header="editId != null ? 'Edit Query Secret' : 'Add Query Secret'"
    modal
    :style="{ width: '560px' }"
    @update:visible="$emit('update:visible', $event)"
  >
    <div class="form-fields">
      <div class="option">
        <label for="qsSourceInput">Source</label>
        <Select
          v-if="!lockedSource"
          input-id="qsSourceInput"
          input-class="field-input"
          v-model="form.liaseSourceId"
          :options="sourcesWithSecrets"
          option-label="name"
          option-value="id"
          :loading="!liaseDetails"
          :disabled="editId != null"
          @update:model-value="form.fieldKey = ''"
        />
        <span v-else class="locked-value">{{ lockedSourceName }}</span>
      </div>

      <div class="option">
        <label for="qsFieldInput">Secret field</label>
        <Select
          v-if="!lockedField"
          input-id="qsFieldInput"
          input-class="field-input"
          v-model="form.fieldKey"
          :options="mergedFields"
          option-label="label"
          option-value="key"
          :loading="!liaseDetails"
          :disabled="!form.liaseSourceId || editId != null"
        >
          <template #option="{ option }">
            <div class="field-option">
              <span class="field-option-name">{{ option.fieldName }} <span class="field-option-type">({{ option.fieldType }})</span></span>
              <span class="field-option-handlers">Used in: {{ option.handlers.join(", ") }}</span>
            </div>
          </template>
          <template #empty>
            {{ form.liaseSourceId ? "No secret fields for this source" : "Select a source first" }}
          </template>
        </Select>
        <div v-else class="locked-field-display">
          <span class="locked-value">{{ lockedFieldName }} <span class="field-type-badge">({{ props.prefillFieldType }})</span></span>
          <span v-if="lockedFieldHandlers.length > 0" class="field-handlers-note">Used in: {{ lockedFieldHandlers.join(", ") }}</span>
        </div>
      </div>

      <div class="option">
        <label for="qsLabelInput">Label</label>
        <InputText
          id="qsLabelInput"
          v-model="form.label"
          placeholder="e.g. Personal account"
          class="field-input"
        />
      </div>

      <div class="option">
        <label for="qsValueInput">Value</label>
        <InputText
          id="qsValueInput"
          v-model="form.value"
          type="password"
          :placeholder="editId != null ? '(unchanged)' : ''"
          class="field-input"
        />
      </div>
    </div>

    <p v-if="error" class="form-error">{{ error }}</p>

    <template #footer>
      <Button label="Cancel" severity="secondary" @click="$emit('update:visible', false)" />
      <Button label="Save" :loading="saving" @click="save" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import type {
  QuerySecretDetailResponse,
  QuerySecretListItem,
} from "@@/types/api-secrets";

const props = defineProps<{
  visible: boolean;
  editId?: number | null;
  prefillSourceId?: string;
  prefillFieldName?: string;
  prefillFieldType?: string;
}>();

const emit = defineEmits<{
  "update:visible": [boolean];
  saved: [QuerySecretListItem];
}>();

// ---- Liase details ----
const { data: liaseDetails } = await useFetch("/api/admin/liase-details", {
  server: false,
});

type HandlerInfo = {
  id: string;
  name: string;
  secretsSchema: JsonSchemaObject | null;
};

type JsonSchemaObject = {
  properties?: Record<string, { type?: string; description?: string }>;
  [key: string]: unknown;
};

type MergedField = {
  key: string; // "fieldName::fieldType"
  fieldName: string;
  fieldType: string;
  handlers: string[];
  label: string;
};

const sourcesWithSecrets = computed(() => {
  if (!liaseDetails.value) return [];
  return Object.values(liaseDetails.value.sources).filter((source) =>
    (source.requestHandlers as HandlerInfo[]).some(
      (h) => h.secretsSchema !== null,
    ),
  );
});

const mergedFields = computed((): MergedField[] => {
  if (!liaseDetails.value || !form.liaseSourceId) return [];
  const handlers = (liaseDetails.value.sources[form.liaseSourceId]
    ?.requestHandlers ?? []) as HandlerInfo[];
  const fieldMap = new Map<string, MergedField>();

  for (const handler of handlers) {
    if (!handler.secretsSchema?.properties) continue;
    for (const [fieldName, def] of Object.entries(
      handler.secretsSchema.properties,
    )) {
      const fieldType = (def as { type?: string }).type ?? "string";
      const key = `${fieldName}::${fieldType}`;
      const existing = fieldMap.get(key);
      if (existing) {
        existing.handlers.push(handler.name ?? handler.id);
      } else {
        fieldMap.set(key, {
          key,
          fieldName,
          fieldType,
          handlers: [handler.name ?? handler.id],
          label: `${fieldName} (${fieldType})`,
        });
      }
    }
  }

  return Array.from(fieldMap.values());
});

// Whether the source/field are locked (pre-filled from query edit)
const lockedSource = computed(
  () => props.editId == null && !!props.prefillSourceId,
);
const lockedField = computed(
  () => props.editId == null && !!props.prefillFieldName,
);

const lockedSourceName = computed(() => {
  if (!liaseDetails.value || !props.prefillSourceId)
    return props.prefillSourceId ?? "";
  return (
    (liaseDetails.value.sources[props.prefillSourceId] as { name?: string })
      ?.name ?? props.prefillSourceId
  );
});

const lockedFieldName = computed(() => props.prefillFieldName ?? "");

const lockedFieldHandlers = computed(() => {
  if (
    !props.prefillSourceId ||
    !props.prefillFieldName ||
    !props.prefillFieldType
  )
    return [];
  const key = `${props.prefillFieldName}::${props.prefillFieldType}`;
  return mergedFields.value.find((f) => f.key === key)?.handlers ?? [];
});

// ---- Form state ----
const form = reactive({
  liaseSourceId: "",
  fieldKey: "",
  label: "",
  value: "",
});

const saving = ref(false);
const error = ref<string | null>(null);

// Reset / populate when dialog opens
watch(
  () => props.visible,
  async (open) => {
    if (!open) return;
    error.value = null;

    if (props.editId != null) {
      form.liaseSourceId = "";
      form.fieldKey = "";
      form.label = "";
      form.value = "";
      try {
        const detail = await $fetch<QuerySecretDetailResponse>(
          `/api/admin/secrets/${props.editId}`,
        );
        form.liaseSourceId = detail.liaseSourceId;
        form.fieldKey = `${detail.secretFieldName}::${detail.secretFieldType}`;
        form.label = detail.label;
        form.value = "";
      } catch {
        error.value = "Failed to load secret details.";
      }
    } else {
      form.liaseSourceId = props.prefillSourceId ?? "";
      form.fieldKey =
        props.prefillFieldName && props.prefillFieldType
          ? `${props.prefillFieldName}::${props.prefillFieldType}`
          : "";
      form.label = "";
      form.value = "";
    }
  },
);

async function save() {
  error.value = null;

  const fieldKey = lockedField.value
    ? `${props.prefillFieldName}::${props.prefillFieldType}`
    : form.fieldKey;
  const sourceId = lockedSource.value
    ? (props.prefillSourceId ?? "")
    : form.liaseSourceId;

  if (!sourceId) {
    error.value = "Source is required.";
    return;
  }
  if (!fieldKey) {
    error.value = "Secret field is required.";
    return;
  }
  if (!form.label.trim()) {
    error.value = "Label is required.";
    return;
  }
  if (props.editId == null && !form.value) {
    error.value = "Value is required.";
    return;
  }

  const [secretFieldName, secretFieldType] = fieldKey.split("::");

  saving.value = true;
  try {
    let result: QuerySecretListItem;
    if (props.editId == null) {
      result = await $fetch<QuerySecretListItem>("/api/admin/secrets", {
        method: "POST",
        body: {
          label: form.label.trim(),
          liaseSourceId: sourceId,
          secretFieldName,
          secretFieldType,
          value: form.value,
        },
      });
    } else {
      const body: Record<string, string> = { label: form.label.trim() };
      if (form.value) body.value = form.value;
      result = await $fetch<QuerySecretListItem>(
        `/api/admin/secrets/${props.editId}`,
        {
          method: "PATCH",
          body,
        },
      );
    }
    emit("saved", result);
    emit("update:visible", false);
  } catch (err) {
    error.value =
      err instanceof Error
        ? err.message
        : "An error occurred. Please try again.";
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.form-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.25rem;
}

.option {
  display: grid;
  grid-template-columns: 140px 1fr;
  align-items: start;
  gap: 0.5rem;
}

.option label {
  padding-top: 0.5rem;
}

.field-input {
  width: 100%;
}

.locked-value {
  padding: 0.5rem 0;
  color: var(--p-text-color);
}

.locked-field-display {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.25rem 0;
}

.field-type-badge {
  color: var(--p-text-muted-color);
  font-size: 0.85em;
}

.field-handlers-note {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.field-option {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.field-option-name {
  font-weight: 500;
}

.field-option-type {
  color: var(--p-text-muted-color);
  font-size: 0.85em;
}

.field-option-handlers {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.form-error {
  color: var(--p-red-500);
  margin-top: 0.75rem;
  font-size: 0.9rem;
}
</style>
