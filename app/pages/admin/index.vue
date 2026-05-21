<template>
  <div>
    <NuxtLink to="/admin/queries">
      Edit queries
    </NuxtLink>
    <NuxtLink to="/admin/secrets">
      Manage query secrets
    </NuxtLink>
    <NuxtLink to="/admin/plugins">
      Manage query plugins
    </NuxtLink>
    <Fieldset
      legend="Debug"
      :toggleable="true"
      :collapsed="true"
    >
      <div>
        <Button
          severity="danger"
          @click="deleteAllMedia"
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
          @click="deleteAllExecutions"
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
          @click="deleteOrphanedLiaseQueryMediaContent"
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
    </Fieldset>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  breadcrumbs: ["Settings"],
});

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
</script>
