<template>
  <div class="execution-details" data-testid="execution-details">
    <template v-if="latestTask">
      <span class="status">
        <div>
          <template v-if="latestTask.status === 'running'">
            Started
            <span
              v-memo="[executionTimestampTooltip.value]"
              class="with-tooltip"
              v-tooltip.top="executionTimestampTooltip"
            ><RelativeTime :date="latestTask.startedAt" /></span>
          </template>
          <template v-else-if="latestTask.status === 'completed'">
            Finished
            <span
              v-memo="[executionTimestampTooltip.value]"
              class="with-tooltip"
              v-tooltip.top="executionTimestampTooltip"
            ><RelativeTime :date="latestTask.finishedAt ?? latestTask.startedAt" /></span>
          </template>
          <template v-else-if="latestTask.status === 'failed'">
            Failed
            <span
              v-memo="[executionTimestampTooltip.value]"
              class="with-tooltip"
              v-tooltip.top="executionTimestampTooltip"
            ><RelativeTime :date="latestTask.finishedAt ?? latestTask.startedAt" /></span>
          </template>
          <template v-else>
            {{ latestTask.status }}
          </template>
        </div>
        <div v-if="statusIcon.length" :class="['pi', ...statusIcon]" />
      </span>
      <div
        v-if="latestTask.status === 'running'"
        class="progress-section"
        data-testid="progress-section"
      >
        <div class="progress-label">
          {{ formatProgressLabel(latestTask, expectedPages) }}
        </div>
        <ProgressBar
          :value="stageProgress.percent"
          :mode="stageProgress.mode"
        />
      </div>
      
      <div v-if="latestTask.status === 'completed'">
        Indexed {{ latestTask.pageCount }} page{{ latestTask.pageCount === 1 ? '' : 's' }} in {{ formatDuration(latestTask) }}.
      </div>
      <div class="stats">
        <div class="groups">
          <Fieldset
            v-if="hasLiaseMediaStats"
            :legend="`Query Results${latestTask.status === 'running' ? ' (so far)' : ''}`"
          >
            <div class="contents">
              <div
                v-if="latestTask.liaseMediaFound !== -1"
                class="stat"
              >
                <span>Found</span>
                <strong>{{ latestTask.liaseMediaFound }}</strong>
              </div>
              <div
                v-if="latestTask.liaseMediaNew !== -1"
                class="stat"
              >
                <span>New</span>
                <strong>{{ latestTask.liaseMediaNew }}</strong>
              </div>
              <div
                v-if="latestTask.liaseMediaUpdated !== -1"
                class="stat"
              >
                <span>Updated</span>
                <strong>{{ latestTask.liaseMediaUpdated }}</strong>
              </div>
              <div
                v-if="latestTask.liaseMediaRemoved !== -1"
                class="stat"
              >
                <span>Removed</span>
                <strong>{{ latestTask.liaseMediaRemoved }}</strong>
              </div>
              <div
                v-if="latestTask.liaseMediaNotSuitable !== -1"
                class="stat"
              >
                <span>Not Suitable</span>
                <strong>{{ latestTask.liaseMediaNotSuitable }}</strong>
              </div>
              <div
                v-if="latestTask.liaseMediaUnchanged !== -1"
                class="stat"
              >
                <span>Unchanged</span>
                <strong>{{ latestTask.liaseMediaUnchanged }}</strong>
              </div>
            </div>
          </Fieldset>
          <Fieldset
            v-if="hasCacheMediaStats"
            :legend="`Cache Media${latestTask.status === 'running' ? ' (so far)' : ''}`"
          >
            <div class="contents">
              <div
                v-if="latestTask.cacheMediaCreated !== -1"
                class="stat"
              >
                <span>Created</span>
                <strong>{{ latestTask.cacheMediaCreated }}</strong>
              </div>
              <div
                v-if="latestTask.cacheMediaUpdated !== -1"
                class="stat"
              >
                <span>Updated</span>
                <strong>{{ latestTask.cacheMediaUpdated }}</strong>
              </div>
              <div
                v-if="latestTask.cacheMediaDeleted !== -1"
                class="stat"
              >
                <span>Deleted</span>
                <strong>{{ latestTask.cacheMediaDeleted }}</strong>
              </div>
              <div
                v-if="latestTask.cacheMediaUnchanged !== -1"
                class="stat"
              >
                <span>Unchanged</span>
                <strong>{{ latestTask.cacheMediaUnchanged }}</strong>
              </div>
            </div>
          </Fieldset>
        </div>
      </div>
      <LogList
        v-if="latestTask.logs.length"
        :logs="latestTask.logs"
      />
      <details v-if="previousTask">
        <summary>Previous Run</summary>
        <ExecutionDetails
          :executions="[previousTask]"
          :fetchCountLimit="fetchCountLimit"
          :limitPerQueryVariation="limitPerQueryVariation"
          :queryVariations="queryVariations"
        />
      </details>
    </template>

    <template v-else>
      This query has never been run.
    </template>
  </div>
</template>

<script setup lang="ts">
import type { QueryExecutionTask } from "@@/server/lib/liase/execution-tasks";
import {
  calculateExpectedPages,
  calculateProcessedInAddOrUpdate,
  calculateStageProgress,
  formatProgressLabel,
  formatStage,
  formatStatus,
} from "~/lib/liase-executions";
import "primeicons/primeicons.css";

const props = defineProps<{
  executions: QueryExecutionTask[];
  fetchCountLimit: number | null;
  limitPerQueryVariation: boolean | null;
  queryVariations: import("@@/server/database/schema").QueryVariation[] | null;
}>();

const latestTask = computed(() => props.executions[0] ?? null);
const previousTask = computed(() => props.executions[1] ?? null);

function formatExactDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const executionTimestampTooltip = computed(() => {
  if (!latestTask.value) return { value: "", escape: true };
  const lines = [`Started: ${formatExactDateTime(latestTask.value.startedAt)}`];
  if (latestTask.value.finishedAt) {
    lines.push(`Finished: ${formatExactDateTime(latestTask.value.finishedAt)}`);
  }
  return { value: lines.join("<br>"), escape: false };
});

const hasLiaseMediaStats = computed(() => {
  if (!latestTask.value) return false;
  return [
    latestTask.value.liaseMediaFound,
    latestTask.value.liaseMediaNew,
    latestTask.value.liaseMediaUpdated,
    latestTask.value.liaseMediaRemoved,
    latestTask.value.liaseMediaNotSuitable,
    latestTask.value.liaseMediaUnchanged,
  ].some((stat) => stat !== -1);
});
const hasCacheMediaStats = computed(() => {
  if (!latestTask.value) return false;
  return [
    latestTask.value.cacheMediaCreated,
    latestTask.value.cacheMediaUpdated,
    latestTask.value.cacheMediaUnchanged,
    latestTask.value.cacheMediaDeleted,
  ].some((stat) => stat !== -1);
});

const statusIcon = computed<string[]>(() => {
  if (latestTask.value?.status === "running") {
    return ["pi-spinner", "pi-spin"];
  }
  if (latestTask.value?.status === "completed") {
    return ["pi-check"];
  }
  if (latestTask.value?.status === "failed") {
    return ["pi-exclamation-triangle"];
  }
  return [];
});

// Denominator for the progress bar when a query is running.
// Use the last run's pageCount, but fall back to fetchCountLimit if the current run
// substantially exceeds it (>1.5x), and fall back to 0 (indeterminate) if neither is available.
const expectedPages = computed(() => {
  if (!latestTask.value) return { number: 0, formattedNumber: "unknown" };
  return calculateExpectedPages(latestTask.value, {
    previousPageCount: previousTask.value?.pageCount,
    fetchCountLimit: props.fetchCountLimit,
    limitPerQueryVariation: props.limitPerQueryVariation,
    queryVariations: props.queryVariations,
  });
});

function formatDuration(task: QueryExecutionTask): string {
  if (!task.finishedAt) return "";
  const ms = task.finishedAt.getTime() - task.startedAt.getTime();
  const seconds = ms / 1000;
  if (seconds < 60)
    return `${Math.round(seconds)} second${Math.round(seconds) === 1 ? "" : "s"}`;
  const minutes = seconds / 60;
  if (minutes < 60)
    return `${+minutes.toFixed(1)} minute${+minutes.toFixed(1) === 1 ? "" : "s"}`;
  const hours = minutes / 60;
  return `${+hours.toFixed(1)} hour${+hours.toFixed(1) === 1 ? "" : "s"}`;
}

const stageProgress = computed(() =>
  latestTask.value
    ? calculateStageProgress(latestTask.value, expectedPages.value.number)
    : { percent: 0, mode: "indeterminate" as const },
);
</script>

<style scoped>
  .execution-details {
    display: flex;
    flex-direction: column;
    padding: 1rem 1.5rem;
    
    .status {
      display: flex;
      gap: 0.4em;
      font-size: 1.4em;
      font-weight: 600;
      margin-bottom: 0.75rem;
      align-items: center;

      .pi {
        font-size: 1.2rem;
        align-items: center;
        translate: 0 -0.1em;

        &.pi-exclamation-triangle {
          color: var(--p-message-error-color);
        }
        &.pi-check {
          color: var(--p-message-success-color);
          font-weight: bold;
        }
        &.pi-spinner {
          color: var(--p-message-info-color);
        }
      }
    }
  }

  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    margin-bottom: 0.75rem;
    
    .stat {
      display: inline-flex;
      flex-direction: column;
    
      span {
        opacity: 0.8;
        font-size: 0.9em;
      }

      strong {
        font-size: 1.5em;
      }
    }
    
    .groups {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      
      .contents {
        display: flex;
        flex-wrap: wrap;
        gap: 1.5rem;
      }
    }
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

  .with-tooltip {
    cursor: help;
    text-decoration: underline dotted;
    text-underline-offset: 2px;
  }
</style>
