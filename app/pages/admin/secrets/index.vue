<template>
  <div class="secrets-page">
    <div class="page-header">
      <h1>Query Secrets</h1>
      <Button @click="openAddDialog">
        <Plus :size="16" />
        Add Secret
      </Button>
    </div>

    <p class="page-description">
      Query secrets store individual secret values (e.g. API keys, tokens) used
      by Liase request handlers. Values are stored encrypted at rest and can be
      assigned to individual secret fields when editing a query.
    </p>

    <Message v-if="encryptionKeyMissing" severity="warn" :closable="false" class="encryption-warning">
      <strong>SECRETS_ENCRYPTION_KEY is not set.</strong> Secret management is
      unavailable until this environment variable is configured on the server.
    </Message>

    <template v-else>
      <div v-if="!secrets || secrets.length === 0" class="empty-state">
        No query secrets configured yet.
      </div>

      <div v-else class="secrets-list">
        <div
          v-for="secret in secrets"
          :key="secret.id"
          class="secret-card"
        >
          <div class="secret-info">
            <span class="secret-label">{{ secret.label }}</span>
            <span class="secret-source">{{ sourceName(secret.liaseSourceId) }}</span>
            <span class="secret-field">
              <span class="secret-field-name">{{ secret.secretFieldName }}</span>
              <span class="secret-field-type">({{ secret.secretFieldType }})</span>
            </span>
            <span v-if="handlersForField(secret).length > 0" class="secret-handlers">
              Used in: {{ handlersForField(secret).join(", ") }}
            </span>
          </div>
          <div class="secret-actions">
            <Button severity="secondary" outlined size="small" @click="openEditDialog(secret)">
              Edit
            </Button>
            <Button severity="danger" outlined size="small" @click="confirmDelete(secret)">
              Delete
            </Button>
          </div>
        </div>
      </div>
    </template>

    <QuerySecretForm
      v-model:visible="showForm"
      :edit-id="editingId"
      @saved="onSaved"
    />

    <!-- Delete confirmation dialog -->
    <Dialog
      v-model:visible="showDeleteDialog"
      header="Delete Query Secret"
      modal
      :style="{ width: '420px' }"
    >
      <p>
        Are you sure you want to delete
        <strong>{{ secretToDelete?.label }}</strong>? This cannot be undone.
      </p>
      <p v-if="deleteError" class="dialog-error">{{ deleteError }}</p>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showDeleteDialog = false" />
        <Button label="Delete" severity="danger" :loading="deleting" @click="deleteSecret" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import type { QuerySecretListItem } from "@@/types/api-secrets";
import { Plus } from "lucide-vue-next";

definePageMeta({
  breadcrumbs: ["Settings", "Query Secrets"],
});

// ---- Liase details (for source/handler names) ----
const { data: liaseDetails } = await useFetch("/api/admin/liase-details", {
  server: false,
});

type HandlerInfo = {
  id: string;
  name: string;
  secretsSchema: { properties?: Record<string, { type?: string }> } | null;
};

function sourceName(sourceId: string) {
  return (
    (liaseDetails.value?.sources[sourceId] as { name?: string })?.name ??
    sourceId
  );
}

function handlersForField(secret: QuerySecretListItem): string[] {
  if (!liaseDetails.value) return [];
  const handlers = (liaseDetails.value.sources[secret.liaseSourceId]
    ?.requestHandlers ?? []) as HandlerInfo[];
  return handlers
    .filter((h) => {
      const props = h.secretsSchema?.properties;
      if (!props) return false;
      const def = props[secret.secretFieldName];
      const fieldType =
        (def as { type?: string } | undefined)?.type ?? "string";
      return fieldType === secret.secretFieldType;
    })
    .map((h) => (h as { name?: string }).name ?? h.id);
}

// ---- Secrets list ----
const {
  data: secrets,
  error: secretsError,
  refresh: refreshSecrets,
} = await useFetch<QuerySecretListItem[]>("/api/admin/secrets", {
  server: false,
});

const encryptionKeyMissing = computed(() => {
  const msg =
    (secretsError.value as { data?: { statusMessage?: string } } | null)?.data
      ?.statusMessage ?? "";
  return msg.includes("SECRETS_ENCRYPTION_KEY");
});

// ---- Add / Edit ----
const showForm = ref(false);
const editingId = ref<number | null>(null);

function openAddDialog() {
  editingId.value = null;
  showForm.value = true;
}

function openEditDialog(secret: QuerySecretListItem) {
  editingId.value = secret.id;
  showForm.value = true;
}

async function onSaved() {
  await refreshSecrets();
}

// ---- Delete ----
const showDeleteDialog = ref(false);
const secretToDelete = ref<QuerySecretListItem | null>(null);
const deleting = ref(false);
const deleteError = ref<string | null>(null);

function confirmDelete(secret: QuerySecretListItem) {
  secretToDelete.value = secret;
  deleteError.value = null;
  showDeleteDialog.value = true;
}

async function deleteSecret() {
  if (!secretToDelete.value) return;
  deleteError.value = null;
  deleting.value = true;
  try {
    await $fetch(`/api/admin/secrets/${secretToDelete.value.id}`, {
      method: "DELETE",
    });
    await refreshSecrets();
    showDeleteDialog.value = false;
  } catch (err) {
    const msg = (err as { data?: { statusMessage?: string } })?.data
      ?.statusMessage;
    deleteError.value =
      msg ?? (err instanceof Error ? err.message : "Delete failed.");
  } finally {
    deleting.value = false;
  }
}
</script>

<style scoped>
.secrets-page {
  max-width: 800px;
  padding: 1.5rem;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;

  h1 {
    margin: 0;
  }
}

.page-description {
  color: var(--p-text-muted-color);
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
}

.encryption-warning {
  margin-bottom: 1.5rem;
}

.empty-state {
  color: var(--p-text-muted-color);
  padding: 2rem 0;
}

.secrets-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.secret-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-md);
  background: var(--p-content-background);
  gap: 1rem;
}

.secret-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.secret-label {
  font-weight: 600;
}

.secret-source {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.secret-field {
  font-size: 0.85rem;
  font-family: monospace;
  display: flex;
  gap: 0.3em;
}

.secret-field-name {
  color: var(--p-text-color);
}

.secret-field-type {
  color: var(--p-text-muted-color);
}

.secret-handlers {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.secret-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.dialog-error {
  color: var(--p-red-500);
  margin-top: 0.75rem;
  font-size: 0.9rem;
}
</style>

