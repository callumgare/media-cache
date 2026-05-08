<template>
  <DataTable
    v-model:expanded-rows="expandedRows"
    :value="queryList ?? []"
    data-key="id"
    table-style="min-width: 50rem"
    :pt="{ bodyRow: options => ({ id: 'query-' + (queryList ?? [])[options.context.index]?.id }) }"
  >
    <Column expander />
    <Column
      header="ID"
      field="id"
    />
    <Column
      header="Source"
      :field="row => row.requestOptions.source"
    />
    <Column
      header="Query Type"
      :field="row => row.requestOptions.queryType"
    />
    <Column
      header="Request Options"
      :field="row => {
        const { source, queryType, ...otherOptions } = row.requestOptions
        return JSON.stringify(otherOptions, null, 2)
      }"
    />
    <Column header="Status">
      <template #body="slotProps">
        <Skeleton
          v-if="!tasksLoaded"
          width="5rem"
          height="1.5rem"
          border-radius="1rem"
        />
        <span
          v-else-if="!executionsForQuery(slotProps.data.id).length && tasksError"
          class="status-badge error"
        >
          Error fetching status
        </span>
        <span
          v-else
          :class="['status-badge', statusClass(executionsForQuery(slotProps.data.id)[0] ?? null)]"
        >
          {{ statusLabel(executionsForQuery(slotProps.data.id)[0] ?? null) }}
        </span>
      </template>
    </Column>
    <Column
      header="Actions"
      body-class="actions"
    >
      <template #body="slotProps">
        <Button @click="() => runQuery(slotProps.data)">
          Run
        </Button>
        <Button
          as="router-link"
          :to="`/admin/queries/${slotProps.data.id}`"
        >
          Edit
        </Button>
        <Button
          severity="danger"
          @click="() => deleteQuery(slotProps.data)"
        >
          Delete
        </Button>
      </template>
    </Column>

    <template #expansion="slotProps">
      <span
        v-if="!executionsForQuery(slotProps.data.id).length && tasksError"
        class="status-badge error"
      >
        Error fetching execution details
      </span>
      <ExecutionDetails
        v-else
        :fetch-count-limit="slotProps.data.fetchCountLimit"
        :executions="executionsForQuery(slotProps.data.id)"
      />
    </template>
  </DataTable>
</template>

<script setup lang="ts">
import type { QueryExecutionTask } from "@@/server/lib/media-finder/execution-tasks";

const toast = useToast();
const route = useRoute();

const {
  data: queryList,
  error: finderDetailsError,
  refresh: refreshQueryList,
} = await useFetch("/api/admin/queries");

if (finderDetailsError.value) {
  throw finderDetailsError.value;
}

type QueryRow = NonNullable<typeof queryList.value>[number];

const { tasks, tasksLoaded, tasksError } = useTasks();

function executionsForQuery(queryId: number): QueryExecutionTask[] {
  return [...tasks.value.values()]
    .filter(
      (task): task is QueryExecutionTask =>
        task.type === "query_execution" && task.queryId === queryId,
    )
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

function statusLabel(execution: QueryExecutionTask | null): string {
  if (!execution) return "Never run";
  if (execution.error || execution.status === "failed") return "Failed";
  if (execution.status === "running") return "Running…";
  if (execution.status === "completed") return "Completed";
  return execution.status;
}

function statusClass(execution: QueryExecutionTask | null): string {
  if (!execution) return "never";
  if (execution.error || execution.status === "failed") return "failed";
  return execution.status;
}
const expandedRows = ref<Record<string, boolean>>({});

onMounted(() => {
  const expandId = route.query.expandQuery;
  if (expandId) {
    expandedRows.value = { [String(expandId)]: true };
    const el = document.getElementById(`query-${expandId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

async function runQuery(query: QueryRow) {
  try {
    await $fetch(`/api/admin/queries/${query.id}/run`);
    toast.add({ severity: "success", summary: "Started", life: 3000 });
    expandedRows.value = { ...expandedRows.value, [String(query.id)]: true };
  } catch (error) {
    console.error(error);
    toast.add({
      severity: "error",
      summary: "Failed",
      detail: (error as Error).message,
      life: 3000,
    });
  }
}

async function deleteQuery(query: QueryRow) {
  try {
    await $fetch(`/api/admin/queries/${query.id}`, { method: "DELETE" });
    await refreshQueryList();
    toast.add({ severity: "success", summary: "Deleted", life: 3000 });
  } catch (error) {
    console.error(error);
    toast.add({
      severity: "error",
      summary: "Failed",
      detail: (error as Error).message,
      life: 3000,
    });
  }
}
</script>

<style scoped>
  .p-datatable {
    margin-bottom: 1em;

    & :deep(.actions) {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5em;
    }
  }

  .status-badge {
    display: inline-block;
    padding: 0.2em 0.6em;
    border-radius: 1em;
    font-size: 0.85em;
    font-weight: 600;

    &.running {
      background: var(--p-blue-100);
      color: var(--p-blue-700);
    }

    &.completed {
      background: var(--p-green-100);
      color: var(--p-green-700);
    }

    &.failed {
      background: var(--p-red-100);
      color: var(--p-red-700);
    }

    &.never {
      background: var(--p-surface-100);
      color: var(--p-surface-500);
    }
  }
</style>
