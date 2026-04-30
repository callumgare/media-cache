<template>
  <div class="execution-details">
    <div
      v-if="renderMode === 'live'"
      class="mode-live"
    >
      <div class="stats-row">
        <span><strong>Media Found:</strong> {{ activeTask!.mediaFound }}</span>
      </div>
      <div class="progress-section">
        <div class="status">
          {{ activeTask!.status }}
        </div>
        <div class="progress-label">
          <template v-if="expectedPages > 0">
            Page {{ activeTask!.pageCount }} of ~{{ expectedPages }}
          </template>
          <template v-else>
            Running… ({{ activeTask!.pageCount }} page{{ activeTask!.pageCount === 1 ? '' : 's' }})
          </template>
        </div>
        <ProgressBar
          :value="progressPercent"
          :mode="expectedPages > 0 ? 'determinate' : 'indeterminate'"
        />
      </div>
      <LogList
        v-if="activeTask!.logs.length"
        :logs="activeTask!.logs"
      />
    </div>

    <div
      v-else-if="renderMode === 'completed'"
      class="mode-completed"
    >
      <div class="stats-row">
        <span><strong>Status:</strong> {{ (lastTask!.error || lastTask!.status === 'failed') ? 'Failed' : 'Completed' }}</span>
        <span><strong>Pages:</strong> {{ lastTask!.pageCount >= 0 ? lastTask!.pageCount : '—' }}</span>
        <span><strong>Found:</strong> {{ lastTask!.mediaFound >= 0 ? lastTask!.mediaFound : '—' }}</span>
        <span><strong>New:</strong> {{ lastTask!.mediaNew >= 0 ? lastTask!.mediaNew : '—' }}</span>
        <span><strong>Updated:</strong> {{ lastTask!.mediaUpdated >= 0 ? lastTask!.mediaUpdated : '—' }}</span>
        <span><strong>Removed:</strong> {{ lastTask!.mediaRemoved >= 0 ? lastTask!.mediaRemoved : '—' }}</span>
        <span v-if="lastTask!.warningCount > 0"><strong>Warnings:</strong> {{ lastTask!.warningCount }}</span>
        <span v-if="lastTask!.nonFatalErrorCount > 0"><strong>Errors:</strong> {{ lastTask!.nonFatalErrorCount }}</span>
        <span v-if="lastTask!.fatalErrorCount > 0"><strong>Fatal errors:</strong> {{ lastTask!.fatalErrorCount }}</span>
      </div>
      <LogList
        v-if="lastTask!.logs?.length"
        :logs="lastTask!.logs"
      />
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
import type { QueryExecutionTask } from '@/composables/useExecutionEvents'

const props = defineProps<{
  fetchCountLimit: number | null
  activeTask: QueryExecutionTask | null
  lastTask: QueryExecutionTask | null
}>()

const renderMode = computed<'live' | 'completed' | 'never-run'>(() => {
  if (props.activeTask) return 'live'
  if (props.lastTask) return 'completed'
  return 'never-run'
})

// Denominator for the progress bar when a query is running.
// Use the last run's pageCount, but fall back to fetchCountLimit if the current run
// substantially exceeds it (>1.5x), and fall back to 0 (indeterminate) if neither is available.
const expectedPages = computed(() => {
  if (!props.activeTask) return 0
  const prev = props.lastTask?.pageCount ?? -1
  const limit = props.fetchCountLimit ?? 0
  if (prev > 0) {
    if (props.activeTask.pageCount <= prev * 1.5) return prev
    return limit > 0 ? limit : 0
  }
  return limit > 0 ? limit : 0
})

const progressPercent = computed(() => {
  if (!props.activeTask || expectedPages.value <= 0) return 0
  return Math.min(100, Math.round((props.activeTask.pageCount / expectedPages.value) * 100))
})
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
