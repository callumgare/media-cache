<template>
  <div class="execution-details" data-testid="execution-details">
    <template v-if="latestTask">
      <span class="status">
        <div>
          {{ formatStatus(latestTask) }}
        </div>
        <div v-if="statusIcon.length" :class="['pi', ...statusIcon]" />
      </span>
      <span v-if="latestTask.status === 'running'">
        <strong>Stage:</strong> {{ formatStage(latestTask) }}
      </span>
      <div
        v-if="latestTask.stage === 'fetching-media-finder-results'"
        class="progress-section"
        data-testid="progress-section"
      >
        <div class="progress-label">
          <template v-if="expectedPages > 0">
            Page {{ latestTask.pageCount }} of ~{{ expectedPages }}
          </template>
          <template v-else>
            Running… ({{ latestTask.pageCount }} page{{ latestTask.pageCount === 1 ? '' : 's' }})
          </template>
        </div>
        <ProgressBar
          :value="progressPercent"
          :mode="expectedPages > 0 ? 'determinate' : 'indeterminate'"
        />
      </div>
      
      <div v-if="latestTask.status === 'completed'">
        Query results had {{ latestTask.pageCount }} page{{ latestTask.pageCount === 1 ? '' : 's' }}.
      </div>
      <div class="stats">
        <div class="groups">
          <Fieldset
            v-if="hasFinderMediaStats"
            :legend="`Query Results${latestTask.status === 'running' ? ' (so far)' : ''}`"
          >
            <div class="contents">
              <div
                v-if="latestTask.finderMediaFound !== -1"
                class="stat"
              >
                <span>Found</span>
                <strong>{{ latestTask.finderMediaFound }}</strong>
              </div>
              <div
                v-if="latestTask.finderMediaNew !== -1"
                class="stat"
              >
                <span>New</span>
                <strong>{{ latestTask.finderMediaNew }}</strong>
              </div>
              <div
                v-if="latestTask.finderMediaUpdated !== -1"
                class="stat"
              >
                <span>Updated</span>
                <strong>{{ latestTask.finderMediaUpdated }}</strong>
              </div>
              <div
                v-if="latestTask.finderMediaRemoved !== -1"
                class="stat"
              >
                <span>Removed</span>
                <strong>{{ latestTask.finderMediaRemoved }}</strong>
              </div>
              <div
                v-if="latestTask.finderMediaNotSuitable !== -1"
                class="stat"
              >
                <span>Not Suitable</span>
                <strong>{{ latestTask.finderMediaNotSuitable }}</strong>
              </div>
              <div
                v-if="latestTask.finderMediaUnchanged !== -1"
                class="stat"
              >
                <span>Unchanged</span>
                <strong>{{ latestTask.finderMediaUnchanged }}</strong>
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
                v-if="latestTask.cacheMediaUnchanged !== -1"
                class="stat"
              >
                <span>Unchanged</span>
                <strong>{{ latestTask.cacheMediaUnchanged }}</strong>
              </div>
              <div
                v-if="latestTask.cacheMediaDeleted !== -1"
                class="stat"
              >
                <span>Deleted</span>
                <strong>{{ latestTask.cacheMediaDeleted }}</strong>
              </div>
            </div>
          </Fieldset>
        </div>
      </div>
      <LogList
        v-if="latestTask.logs.length"
        :logs="latestTask.logs"
      />
    </template>

    <template v-else>
      This query has never been run.
    </template>
  </div>
</template>

<script setup lang="ts">
import type { QueryExecutionTask } from "@@/server/lib/media-finder/execution-tasks";
import { formatStage, formatStatus } from "~/lib/finder-executions";
import "primeicons/primeicons.css";

const props = defineProps<{
  fetchCountLimit: number | null;
  executions: QueryExecutionTask[];
}>();

const latestTask = computed(() => props.executions[0] ?? null);
const previousTask = computed(() => props.executions[1] ?? null);

const hasFinderMediaStats = computed(() => {
  if (!latestTask.value) return false;
  return [
    latestTask.value.finderMediaFound,
    latestTask.value.finderMediaNew,
    latestTask.value.finderMediaUpdated,
    latestTask.value.finderMediaRemoved,
    latestTask.value.finderMediaNotSuitable,
    latestTask.value.finderMediaUnchanged,
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
</style>
