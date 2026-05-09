<template>
  <div>
    <NuxtLink to="/admin/queries">
      Edit queries
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
</script>
