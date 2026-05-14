<template>
  <div class="execution-details" data-testid="execution-details">
    <template v-if="latestTask">
      <span class="status">
        <div>
          {{ formatStatus(latestTask) }}
        </div>
        <div v-if="statusIcon.length" :class="['pi', ...statusIcon]" />
      </span>
      <div
        v-if="latestTask.status === 'running'"
        class="progress-section"
        data-testid="progress-section"
      >
        <div class="progress-label">
          <template v-if="latestTask.stage === 'fetching-liase-results'">
            <template v-if="expectedPages.number > 0">
              Indexing page {{ latestTask.pageCount }} of {{ expectedPages.formattedNumber }}
            </template>
            <template v-else>
              Running… ({{ latestTask.pageCount }} page{{ latestTask.pageCount === 1 ? '' : 's' }})
            </template>
          </template>
          <template v-else-if="latestTask.stage === 'processing-added-or-updated'">
            Processing {{ processedInAddOrUpdate }} new or updated of {{ latestTask.liaseMediaFound !== -1 ? latestTask.liaseMediaFound : '?' }}
          </template>
          <template v-else-if="latestTask.stage === 'processing-removed'">
            Processing removed media…
          </template>
          <template v-else-if="latestTask.stage === 'removing-previous-execution-results'">
            Removing previous execution results…
          </template>
          <template v-else>
            Stage: {{ formatStage(latestTask) }}
          </template>
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
import type { QueryExecutionTask } from "@@/server/lib/liase/execution-tasks";
import { formatStage, formatStatus } from "~/lib/liase-executions";
import "primeicons/primeicons.css";

const props = defineProps<{
  executions: QueryExecutionTask[];
  fetchCountLimit: number | null;
  limitPerQueryVariation: boolean | null;
  queryVariations: import("@@/server/database/schema").QueryVariation[] | null;
}>();

const latestTask = computed(() => props.executions[0] ?? null);
const previousTask = computed(() => props.executions[1] ?? null);

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

// The number of expanded query requests: sum of cartesian-product sizes across variations
// (mirrors expandAllVariations in run-query.ts). Falls back to 1 when there are no variations.
const expandedVariationCount = computed(() => {
  const variations = props.queryVariations;
  if (!variations || variations.length === 0) return 1;
  return variations.reduce((sum, variation) => {
    const entries = Object.values(variation.fieldOverrides).filter(
      (values) => values.length > 0,
    );
    const cartesianSize = entries.reduce(
      (product, values) => product * values.length,
      1,
    );
    return sum + cartesianSize;
  }, 0);
});

// Denominator for the progress bar when a query is running.
// Use the last run's pageCount, but fall back to fetchCountLimit if the current run
// substantially exceeds it (>1.5x), and fall back to 0 (indeterminate) if neither is available.
const expectedPages = computed(() => {
  if (!latestTask.value) return { number: 0, formattedNumber: "unknown" };
  const prev = previousTask.value?.pageCount ?? -1;
  const limit =
    props.fetchCountLimit !== null
      ? props.fetchCountLimit *
        (props.limitPerQueryVariation ? expandedVariationCount.value : 1)
      : null;
  const formattedLimit = limit !== null ? `max ${limit}` : "";
  if (prev > 0 && latestTask.value.pageCount <= prev * 1.5) {
    return {
      number: prev,
      formattedNumber: `~${prev}${formattedLimit ? ` (${formattedLimit})` : ""}`,
    };
  }
  const normalisedLimit = typeof limit === "number" && limit > 0 ? limit : 0;
  return {
    number: normalisedLimit,
    formattedNumber: formattedLimit || "unknown",
  };
});

const processedInAddOrUpdate = computed(() => {
  if (!latestTask.value) return 0;
  const { liaseMediaNew, liaseMediaUpdated, liaseMediaUnchanged } =
    latestTask.value;
  return (
    (liaseMediaNew !== -1 ? liaseMediaNew : 0) +
    (liaseMediaUpdated !== -1 ? liaseMediaUpdated : 0) +
    (liaseMediaUnchanged !== -1 ? liaseMediaUnchanged : 0)
  );
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

const stageProgress = computed(() => {
  if (!latestTask.value) return { percent: 0, mode: "indeterminate" as const };

  const stage = latestTask.value.stage;

  if (stage === "fetching-liase-results") {
    if (expectedPages.value.number > 0) {
      return {
        percent: Math.min(
          55,
          Math.round(
            (latestTask.value.pageCount / expectedPages.value.number) * 55,
          ),
        ),
        mode: "determinate" as const,
      };
    }
    return { percent: 0, mode: "indeterminate" as const };
  }

  if (stage === "processing-added-or-updated") {
    const total = latestTask.value.liaseMediaFound;
    if (total > 0) {
      return {
        percent: Math.min(
          90,
          Math.round(55 + (processedInAddOrUpdate.value / total) * 35),
        ),
        mode: "determinate" as const,
      };
    }
    return { percent: 55, mode: "determinate" as const };
  }

  if (stage === "processing-removed") {
    return { percent: 90, mode: "determinate" as const };
  }

  if (stage === "removing-previous-execution-results") {
    return { percent: 95, mode: "determinate" as const };
  }

  return { percent: 0, mode: "indeterminate" as const };
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
