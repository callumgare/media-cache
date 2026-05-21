<template>
  <div class="debug-page">
    <ConfirmDialog />
    <div>
      <Button
        severity="danger"
        @click="confirmDeleteAllMedia"
      >
        Delete all media
      </Button>
      <div v-if="deleteAllMediaProgress.length" class="progress">
        <pre
          v-for="(message, index) in deleteAllMediaProgress"
          :key="index"
          class="progress-message"
        >{{ message }}</pre>
      </div>
    </div>
    <div>
      <Button
        severity="danger"
        @click="confirmDeleteAllExecutions"
      >
        Delete all executions
      </Button>
      <div v-if="deleteAllExecutionsProgress.length" class="progress">
        <pre
          v-for="(message, index) in deleteAllExecutionsProgress"
          :key="index"
          class="progress-message"
        >{{ message }}</pre>
      </div>
    </div>
    <div>
      <Button
        severity="danger"
        @click="confirmDeleteOrphanedLiaseQueryMediaContent"
      >
        Delete orphaned liase query media content
      </Button>
      <div v-if="deleteOrphanedLiaseQueryMediaContentProgress.length" class="progress">
        <pre
          v-for="(message, index) in deleteOrphanedLiaseQueryMediaContentProgress"
          :key="index"
          class="progress-message"
        >{{ message }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: "admin",
  breadcrumbs: ["Settings", "Debug"],
});

const confirm = useConfirm();

function useDebugDeleteAllMedia() {
  let progressEvents: EventSource | null = null;
  const progress = ref<string[]>([]);

  function run() {
    if (progressEvents) return; // Already connected

    progress.value = []; // Clear previous progress
    progressEvents = new EventSource("/api/admin/debug/delete-all-media");
    progressEvents.onmessage = (e) => {
      progress.value.push(e.data);
    };
    progressEvents.onerror = () => {
      // If the server closes the connection it's considered an error by EventStream but in this case it just means
      // that we're done, so we can ignore it.
      progressEvents?.close();
      progressEvents = null;
    };

    return {
      deleteAllMediaProgress: progress,
      deleteAllMedia: run,
    };
  }

  return { deleteAllMedia: run, deleteAllMediaProgress: progress };
}

function useDebugDeleteAllExecutions() {
  let progressEvents: EventSource | null = null;
  const progress = ref<string[]>([]);

  function run() {
    if (progressEvents) return; // Already connected

    progress.value = []; // Clear previous progress
    progressEvents = new EventSource("/api/admin/debug/delete-all-executions");
    progressEvents.onmessage = (e) => {
      progress.value.push(e.data);
    };
    progressEvents.onerror = () => {
      // If the server closes the connection it's considered an error by EventStream but in this case it just means
      // that we're done, so we can ignore it.
      progressEvents?.close();
      progressEvents = null;
    };

    return {
      deleteAllExecutionsProgress: progress,
      deleteAllExecutions: run,
    };
  }

  return { deleteAllExecutions: run, deleteAllExecutionsProgress: progress };
}

const { deleteAllMedia, deleteAllMediaProgress } = useDebugDeleteAllMedia();
const { deleteAllExecutions, deleteAllExecutionsProgress } =
  useDebugDeleteAllExecutions();

function useDebugDeleteOrphanedLiaseQueryMediaContent() {
  let progressEvents: EventSource | null = null;
  const progress = ref<string[]>([]);

  function run() {
    if (progressEvents) return; // Already connected

    progress.value = []; // Clear previous progress
    progressEvents = new EventSource(
      "/api/admin/debug/delete-orphaned-liase-query-media-content",
    );
    progressEvents.onmessage = (e) => {
      progress.value.push(e.data);
    };
    progressEvents.onerror = () => {
      // If the server closes the connection it's considered an error by EventStream but in this case it just means
      // that we're done, so we can ignore it.
      progressEvents?.close();
      progressEvents = null;
    };
  }

  return {
    deleteOrphanedLiaseQueryMediaContent: run,
    deleteOrphanedLiaseQueryMediaContentProgress: progress,
  };
}

const {
  deleteOrphanedLiaseQueryMediaContent,
  deleteOrphanedLiaseQueryMediaContentProgress,
} = useDebugDeleteOrphanedLiaseQueryMediaContent();

function confirmDeleteAllMedia() {
  confirm.require({
    message: "This will permanently delete all media. Are you sure?",
    header: "Delete all media",
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Cancel", severity: "secondary", outlined: true },
    acceptProps: { label: "Delete", severity: "danger" },
    accept: deleteAllMedia,
  });
}

function confirmDeleteAllExecutions() {
  confirm.require({
    message: "This will permanently delete all executions. Are you sure?",
    header: "Delete all executions",
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Cancel", severity: "secondary", outlined: true },
    acceptProps: { label: "Delete", severity: "danger" },
    accept: deleteAllExecutions,
  });
}

function confirmDeleteOrphanedLiaseQueryMediaContent() {
  confirm.require({
    message:
      "This will permanently delete all orphaned Liase query media content. Are you sure?",
    header: "Delete orphaned Liase query media content",
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Cancel", severity: "secondary", outlined: true },
    acceptProps: { label: "Delete", severity: "danger" },
    accept: deleteOrphanedLiaseQueryMediaContent,
  });
}
</script>

<style scoped>
  .debug-page {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .progress {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--card-background);
    border: 1px solid var(--card-border-color);
    border-radius: 6px;
    max-height: 200px;
    overflow-y: auto;
  }

  .progress-message {
    margin: 0;
    font-family: monospace;
    font-size: 0.9rem;
  }
</style>
