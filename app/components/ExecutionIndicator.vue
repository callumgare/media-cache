<script setup lang="ts">
import type { QueryListResponse } from "@@/types/api-queries";
import {
  calculateExpectedPages,
  calculateStageProgress,
  formatProgressLabel,
} from "~/lib/liase-executions";

const { runningExecutionList } = useTasks();

const { $superFetch } = useNuxtApp();
const savedQueries = ref<QueryListResponse>([]);
watch(
  () => runningExecutionList.value.length > 0,
  async (hasRunning) => {
    if (hasRunning) {
      try {
        savedQueries.value =
          await $superFetch<QueryListResponse>("/api/admin/queries");
      } catch (e) {
        console.error("ExecutionIndicator: failed to fetch saved queries", e);
      }
    }
  },
  { immediate: true },
);

function queryTitle(queryId: number | null): string {
  if (queryId === null) return "Unknown query";
  return (
    savedQueries.value.find((q) => q.id === queryId)?.requestOptions.source ??
    `Query #${queryId}`
  );
}

const executionInfoList = computed(() =>
  runningExecutionList.value.map((execution) => {
    const query = savedQueries.value.find((q) => q.id === execution.queryId);
    const expectedPages = query
      ? calculateExpectedPages(execution, {
          fetchCountLimit: query.fetchCountLimit,
          limitPerQueryVariation: query.fetchCountLimitPerVariation,
          queryVariations: query.queryVariations,
        })
      : { number: 0, formattedNumber: "unknown" };
    return {
      execution,
      stageProgress: calculateStageProgress(execution, expectedPages.number),
      progressLabel: formatProgressLabel(execution, expectedPages),
    };
  }),
);

const executionPopover = ref();

const averagePercent = computed(() => {
  const determinate = executionInfoList.value.filter(
    (i) => i.stageProgress.mode === "determinate",
  );
  if (!determinate.length) return null;
  const avg =
    determinate.reduce((sum, i) => sum + i.stageProgress.percent, 0) /
    determinate.length;
  return Math.round(avg);
});
</script>

<template>
  <template v-if="runningExecutionList.length">
    <span
      @mouseenter="executionPopover?.show($event)"
      @mouseleave="executionPopover?.hide()"
    >
      <NuxtLink
        to="/admin/queries"
        class="execution-indicator"
        data-testid="execution-indicator"
      >
        <span class="spinner-wrapper">
          <ProgressSpinner
            stroke-width="6"
            animation-duration="1.2s"
          />
          <span v-if="averagePercent !== null" class="spinner-percent">{{ averagePercent }}%</span>
        </span>
      </NuxtLink>
    </span>
    <Popover ref="executionPopover" class="execution-indicator-popover">
      <div
        v-for="info in executionInfoList"
        :key="info.execution.executionId"
      >
        {{ queryTitle(info.execution.queryId) }} — {{ info.progressLabel }}<template v-if="info.stageProgress.mode === 'determinate'"> ({{ info.stageProgress.percent }}%)</template>
      </div>
    </Popover>
  </template>
</template>

<style scoped>
  .execution-indicator {
    display: flex;
    align-items: center;
    text-decoration: none;

    .spinner-wrapper {
      position: relative;
      display: flex;
      align-items: center;

      .p-progressspinner {
        width: 1.6rem;
        height: 1.6rem;
        opacity: 0.5;
      }

      .spinner-percent {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.9rem;
        font-weight: 600;
        line-height: 1;
        pointer-events: none;
      }
    }
  }
</style>
