<template>
  <div class="plugins-page">
    <p class="page-description">
      Plugins extend Liase with additional media sources.
    </p>
    <p v-if="uiState.debugMode" class="page-description">
      Plugin directory: <code>{{ pluginsDir }}</code>
    </p>

    <!-- Install form -->
    <div class="install-form">
      <h2>Install plugin</h2>
      <div class="install-fields">
        <InputText
          v-model="installName"
          placeholder="package name of plugin (e.g. @liase/example-plugin)"
          class="install-name-input"
          :disabled="npmBusy"
        />
        <Select
          ref="versionSelectRef"
          v-model="installVersion"
          :options="versionOptions"
          :placeholder="loadingVersions ? 'Loading…' : 'Latest version'"
          :loading="loadingVersions"
          :disabled="npmBusy || !installName.trim()"
          show-clear
          class="install-version-select"
          @focus="loadVersions"
        >
          <template #option="{ option, index }">
            {{ option }}<span v-if="index === 0 && option !== 'custom'" class="version-latest-tag">(latest)</span>
          </template>
        </Select>
        <InputText
          v-if="installVersion === 'custom'"
          v-model="customVersion"
          placeholder="e.g. 1.2.3 or file:../my-plugin"
          class="install-custom-version-input"
          :disabled="npmBusy"
        />
        <Button
          label="Install"
          :loading="npmBusy"
          :disabled="!installName.trim()"
          @click="installPlugin"
        />
      </div>
    </div>

    <!-- Plugin list -->
    <div class="plugin-list-section">
      <h2>Installed plugins</h2>

      <div v-if="pending" class="loading">
        Loading…
      </div>
      <div v-else-if="!plugins || plugins.length === 0" class="empty-state">
        No plugins installed yet.
      </div>
      <div v-else class="plugin-list">
        <div
          v-for="plugin in plugins"
          :key="plugin.name"
          class="plugin-card"
        >
          <div class="plugin-info">
            <span class="plugin-name">{{ plugin.name }}</span>
            <span class="plugin-version">
              {{ plugin.installedVersion ?? plugin.listedVersion }}
            </span>
          </div>
          <div class="plugin-actions">
            <Button
              v-if="plugin.latestVersion && plugin.latestVersion !== plugin.installedVersion"
              severity="secondary"
              outlined
              size="small"
              :loading="npmBusy"
              @click="updatePlugin(plugin.name)"
            >
              Update to {{ plugin.latestVersion }} (latest)
            </Button>
            <Button
              severity="danger"
              outlined
              size="small"
              :loading="npmBusy"
              @click="confirmRemove(plugin.name)"
            >
              Remove
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- npm output dialog -->
    <Dialog
      v-model:visible="showOutputDialog"
      :header="outputDialogTitle"
      modal
      :closable="npmDone"
      :style="{ width: '600px' }"
    >
      <pre ref="outputEl" class="npm-output">{{ npmOutput }}</pre>
      <p v-if="npmSuccess" class="npm-success">{{ npmSuccess }}</p>
      <p v-if="npmError" class="npm-error">{{ npmError }}</p>
      <template #footer>
        <Button
          v-if="npmDone"
          label="Close"
          @click="closeOutputDialog"
        />
        <Button
          v-else
          label="Running…"
          :loading="true"
          disabled
        />
      </template>
    </Dialog>

    <!-- Remove confirmation dialog -->
    <Dialog
      v-model:visible="showRemoveDialog"
      header="Remove plugin"
      modal
      :style="{ width: '420px' }"
    >
      <p>
        Remove <strong>{{ pluginToRemove }}</strong>?
      </p>
      <template #footer>
        <Button
          label="Cancel"
          severity="secondary"
          @click="showRemoveDialog = false"
        />
        <Button
          label="Remove"
          severity="danger"
          @click="removePlugin"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { useUiState } from "@@/stores/ui";
import type { PluginInfo, PluginNpmMessage } from "@@/types/api-plugins";

definePageMeta({
  layout: "admin",
  breadcrumbs: ["Settings", "Query Plugins"],
});

// ---- Plugin list ----
const {
  data: plugins,
  pending,
  refresh: refreshPlugins,
} = await useFetch<PluginInfo[]>("/api/admin/plugins", { server: false });

// ---- Plugins directory (shown in description) ----
// We derive it from env or show a generic description
const pluginsDir = computed(
  () => process.env.PLUGINS_DIR ?? "~/.media-cache/plugins",
);

// ---- Install form ----
const uiState = useUiState();
const installName = ref("");
const installVersion = ref<string | null>("");

// ---- Version picker ----
const versionSelectRef = ref<{ show: () => void } | null>(null);
const availableVersions = ref<string[] | null>(null);
const loadingVersions = ref(false);
const customVersion = ref("");

const versionOptions = computed(() => [
  ...(availableVersions.value ?? []),
  ...(uiState.debugMode ? ["custom"] : []),
]);

watch(installName, () => {
  installVersion.value = "";
  availableVersions.value = null;
  customVersion.value = "";
});

async function loadVersions() {
  if (!installName.value.trim()) return;
  if (availableVersions.value !== null) return; // already loaded for this package
  loadingVersions.value = true;
  try {
    availableVersions.value = await $fetch<string[]>(
      `/api/admin/plugins/versions?name=${encodeURIComponent(installName.value.trim())}`,
    );
    await nextTick();
    versionSelectRef.value?.show();
  } catch {
    availableVersions.value = [];
  } finally {
    loadingVersions.value = false;
  }
}

async function installPlugin() {
  const name = installName.value.trim();
  if (!name) return;
  const version =
    installVersion.value === "custom"
      ? customVersion.value.trim() || undefined
      : installVersion.value?.trim() || undefined;
  await runNpmOperation({
    title: `Installing ${name}…`,
    url: "/api/admin/plugins",
    method: "POST",
    body: { name, version },
    successMessage: `${name} installed successfully`,
    failureMessage: `Failed to install ${name}`,
  });
  installName.value = "";
  installVersion.value = "";
  customVersion.value = "";
}

// ---- Update ----
async function updatePlugin(name: string) {
  await runNpmOperation({
    title: `Updating ${name}…`,
    url: "/api/admin/plugins",
    method: "PATCH",
    body: { name },
    successMessage: `${name} updated successfully`,
    failureMessage: `Failed to update ${name}`,
  });
}

// ---- Remove ----
const showRemoveDialog = ref(false);
const pluginToRemove = ref<string | null>(null);

function confirmRemove(name: string) {
  pluginToRemove.value = name;
  showRemoveDialog.value = true;
}

async function removePlugin() {
  if (!pluginToRemove.value) return;
  showRemoveDialog.value = false;
  await runNpmOperation({
    title: `Removing ${pluginToRemove.value}…`,
    url: "/api/admin/plugins",
    method: "DELETE",
    body: { name: pluginToRemove.value },
    successMessage: `${pluginToRemove.value} removed successfully`,
    failureMessage: `Failed to remove ${pluginToRemove.value}`,
  });
  pluginToRemove.value = null;
}

// ---- npm streaming output ----
const npmBusy = ref(false);
const npmDone = ref(false);
const npmOutput = ref("");
const npmError = ref<string | null>(null);
const npmSuccess = ref<string | null>(null);
const showOutputDialog = ref(false);
const outputDialogTitle = ref("");
const outputEl = ref<HTMLPreElement | null>(null);

async function runNpmOperation(options: {
  title: string;
  url: string;
  method: "POST" | "PATCH" | "DELETE";
  body: object;
  successMessage: string;
  failureMessage: string;
}) {
  const { title, url, method, body, successMessage, failureMessage } = options;
  npmBusy.value = true;
  npmDone.value = false;
  npmOutput.value = "";
  npmError.value = null;
  npmSuccess.value = null;
  outputDialogTitle.value = title;
  showOutputDialog.value = true;

  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson: { statusMessage?: string } | undefined;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        // Can't parse response body, throw generic error below
      }
      if (errorJson?.statusMessage) {
        npmOutput.value += `${failureMessage}: ${errorJson.statusMessage}\n`;
        await scrollOutputToEnd();
        throw new Error(`${failureMessage}: ${errorJson.statusMessage}`);
      }
      npmOutput.value += `Unexpected response (status code ${response.status}): ${errorText}\n`;
      await scrollOutputToEnd();
      throw new Error(failureMessage);
    }

    if (!response.body) {
      npmOutput.value += "-- No response body --\n";
      await scrollOutputToEnd();
      throw new Error(failureMessage);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.slice(6);
          let msg: PluginNpmMessage;
          try {
            msg = JSON.parse(jsonStr) as PluginNpmMessage;
          } catch {
            npmOutput.value += "Warning: Recieved invalid message\n";
            npmOutput.value += `Message: ${jsonStr}\n`;
            await scrollOutputToEnd();
            continue;
          }
          if (msg.type === "output") {
            npmOutput.value += msg.data;
            await scrollOutputToEnd();
          } else if (msg.type === "done") {
            await refreshPlugins();
            npmSuccess.value = successMessage;
          } else if (msg.type === "error") {
            npmError.value = `${failureMessage}: ${msg.message}`;
          } else {
            npmOutput.value += `Warning: Recieved message with unrecognised type "${(msg as { type: string }).type}"\n`;
            npmOutput.value += `Message: ${JSON.stringify(msg, null, 2)}\n`;
            await scrollOutputToEnd();
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (err) {
    npmError.value = `${failureMessage}: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    npmBusy.value = false;
    npmDone.value = true;
  }
}

async function scrollOutputToEnd() {
  await nextTick();
  if (outputEl.value) {
    outputEl.value.scrollTop = outputEl.value.scrollHeight;
  }
}

function closeOutputDialog() {
  showOutputDialog.value = false;
}
</script>

<style scoped>
.plugins-page {
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

  code {
    font-family: monospace;
    background: var(--p-surface-100);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
  }
}

.restart-notice {
  margin-bottom: 1.5rem;
}

.install-form {
  margin-bottom: 2rem;

  h2 {
    font-size: 1rem;
    margin-bottom: 0.75rem;
  }
}

.install-fields {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.install-name-input {
  flex: 2 1 260px;
}

.install-version-inplace {
  flex: 1 1 140px;
}

.install-version-btn {
  width: 100%;
  justify-content: space-between;
}

.install-version-select {
  flex: 1 1 140px;
}

.install-custom-version-input {
  flex: 1 1 160px;
}

.version-latest-tag {
  color: var(--p-text-muted-color);
  font-size: 0.85em;
  margin-left: 0.4em;
}

.plugin-list-section {
  h2 {
    font-size: 1rem;
    margin-bottom: 0.75rem;
  }
}

.loading,
.empty-state {
  color: var(--p-text-muted-color);
  padding: 1rem 0;
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.plugin-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  /*
  Having more space on the side than the top/bottom looks best for text like the package name on the left side but
  constistant spacing looks better for a block like the buttons on the right side.
  */
  padding: 0.75rem 0.75rem 0.75rem 1rem;
  border: 1px solid var(--card-border-color);
  border-radius: 6px;
  background: var(--card-background);
}

.plugin-info {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0.5rem;
  min-width: 0;
}

.plugin-name {
  font-weight: 600;
  font-family: monospace;
}

.plugin-version {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.plugin-update-available {
  font-size: 0.85rem;
  color: var(--p-yellow-600);
}

.plugin-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.npm-output {
  background: var(--p-surface-900);
  color: var(--p-surface-0);
  font-family: monospace;
  font-size: 0.8rem;
  padding: 0.75rem;
  border-radius: 4px;
  max-height: 320px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.npm-success {
  color: var(--p-green-700);
  margin-top: 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
}

.npm-error {
  color: var(--p-red-500);
  margin-top: 0.75rem;
  font-size: 0.9rem;
}
</style>
