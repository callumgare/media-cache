<template>
  <div class="execution-details">
    <div
      v-if="latestTask?.status === 'running'"
      class="mode-live"
    >
      <div class="stats-row">
        <span><strong>Media Found:</strong> {{ latestTask!.mediaFound }}</span>
      </div>
      <div class="progress-section">
        <div class="status">
          {{ latestTask?.statusDetails || latestTask!.status }}
        </div>
        <div class="progress-label">
          <template v-if="expectedPages > 0">
            Page {{ latestTask!.pageCount }} of ~{{ expectedPages }}
          </template>
          <template v-else>
            Running… ({{ latestTask!.pageCount }} page{{ latestTask!.pageCount === 1 ? '' : 's' }})
          </template>
        </div>
        <ProgressBar
          :value="progressPercent"
          :mode="expectedPages > 0 ? 'determinate' : 'indeterminate'"
        />
      </div>
      <LogList
        v-if="latestTask!.logs.length"
        :logs="latestTask!.logs"
      />
    </div>

    <div
      v-else-if="latestTask?.status === 'completed' || latestTask?.status === 'failed'"
      class="mode-completed"
    >
      <div class="stats-row">
        <span><strong>Status:</strong> {{ (latestTask!.error || latestTask!.status === 'failed') ? 'Failed' : 'Completed' }}</span>
        <span><strong>Pages:</strong> {{ latestTask!.pageCount >= 0 ? latestTask!.pageCount : '—' }}</span>
        <span><strong>Found:</strong> {{ latestTask!.mediaFound >= 0 ? latestTask!.mediaFound : '—' }}</span>
        <span><strong>New:</strong> {{ latestTask!.mediaNew >= 0 ? latestTask!.mediaNew : '—' }}</span>
        <span><strong>Updated:</strong> {{ latestTask!.mediaUpdated >= 0 ? latestTask!.mediaUpdated : '—' }}</span>
        <span><strong>Removed:</strong> {{ latestTask!.mediaRemoved >= 0 ? latestTask!.mediaRemoved : '—' }}</span>
        <span v-if="latestTask!.warningCount > 0"><strong>Warnings:</strong> {{ latestTask!.warningCount }}</span>
        <span v-if="latestTask!.nonFatalErrorCount > 0"><strong>Errors:</strong> {{ latestTask!.nonFatalErrorCount }}</span>
        <span v-if="latestTask!.fatalErrorCount > 0"><strong>Fatal errors:</strong> {{ latestTask!.fatalErrorCount }}</span>
      </div>
      <LogList
        v-if="latestTask!.logs?.length"
        :logs="latestTask!.logs"
      />
    </div>

    <div
      v-else-if="latestTask"
      class="mode-unknown"
    >
      Execution status: {{ latestTask.status }}
    </div>

    <p
      v-else
      class="never-run"
    >
      This query has never been run.
    </p>
  </div>
</template>

<script setup lang="ts">
import type { QueryExecutionTask } from "@@/server/lib/media-finder/execution-tasks";

const props = defineProps<{
  fetchCountLimit: number | null;
  executions: QueryExecutionTask[];
}>();

const latestTask = computed(() => props.executions[0] ?? null);
const previousTask = computed(() => props.executions[1] ?? null);

// Denominator for the progress bar when a query is running.
// Use the last run's pageCount, but fall back to fetchCountLimit if the current run
// substantially exceeds it (>1.5x), and fall back to 0 (indeterminate) if neither is available.
const expectedPages = computed(() => {
  if (!latestTask.value) return 0;
  const prev = previousTask.value?.pageCount ?? -1;
  const limit = props.fetchCountLimit ?? 0;
  if (prev > 0) {
    if (latestTask.value.pageCount <= prev * 1.5) return prev;
    return limit > 0 ? limit : 0;
  }
  return limit > 0 ? limit : 0;
});

const progressPercent = computed(() => {
  if (!latestTask.value || expectedPages.value <= 0) return 0;
  return Math.min(
    100,
    Math.round((latestTask.value.pageCount / expectedPages.value) * 100),
  );
});
</script>

<style scoped>
  .execution-details {
    padding: 1rem 1.5rem;
  }

  .stats-row {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    margin-bottom: 0.75rem;
  }

  .progress-section {
    margin-bottom: 0.75rem;

    .status {
      font-size: 0.9em;
      font-weight: 500;
      color: var(--p-text-color);
      margin-bottom: 0.5rem;
    }

    .progress-label {
      font-size: 0.85em;
      color: var(--p-text-muted-color);
      margin-bottom: 0.3rem;
    }
  }

  .never-run {
    color: var(--p-text-muted-color);
    font-style: italic;
  }
</style>
