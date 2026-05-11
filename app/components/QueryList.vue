<template>
  <DataTable
    v-model:expanded-rows="expandedRows"
    :value="queryList ?? []"
    data-key="id"
    table-style="min-width: 50rem"
    :pt="{ bodyRow: options => ({ id: 'query-' + (queryList ?? [])[options.context.index]?.id }) }"
    :loading="queryListStatus === 'pending'"
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
    <Column header="Request Options">
      <template #body="slotProps">
        <dl
          v-if="getDisplayOptions(slotProps.data).length"
          class="request-options-list"
        >
          <div
            v-for="opt in getDisplayOptions(slotProps.data)"
            :key="opt.key"
            class="request-option"
          >
            <dt>{{ opt.key }}</dt>
            <dd v-if="opt.variationValues">
              {{  opt.variationValues.join(" × ") }}
              <span
                v-if="opt.moreCount"
                class="more-count"
              >+{{ opt.moreCount }} more</span>
            </dd>
            <dd v-else>{{ formatOptionValue(opt.value) }}</dd>
          </div>
        </dl>
        <span
          v-else
          class="no-options"
        >—</span>
      </template>
    </Column>
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
          data-testid="status-badge"
        >
          Error fetching status
        </span>
        <span
          v-else
          :class="['status-badge', executionsForQuery(slotProps.data.id)[0]?.status ?? 'never']"
          data-testid="status-badge"
        >
          {{ formatStatus(executionsForQuery(slotProps.data.id)[0] ?? null) }}
        </span>
      </template>
    </Column>
    <Column header="Actions">
      <template #body="slotProps">
        <div class="inline-list">
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
        </div>
      </template>
    </Column>

    <template #expansion="slotProps">
      <span
        v-if="!executionsForQuery(slotProps.data.id).length && tasksError"
        class="status-badge error"
        data-testid="status-badge"
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
import { formatStatus } from "~/lib/finder-executions";

const toast = useToast();
const route = useRoute();

const {
  data: queryList,
  error: finderDetailsError,
  refresh: refreshQueryList,
  status: queryListStatus,
} = await useSuperFetch("/api/admin/queries");

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

type DisplayOption =
  | {
      key: string;
      value: unknown;
      variationValues?: undefined;
      moreCount?: undefined;
    }
  | {
      key: string;
      value?: undefined;
      variationValues: string[];
      moreCount: number;
    };

const VARIATION_PREVIEW_LIMIT = 3;

function getDisplayOptions(row: QueryRow): DisplayOption[] {
  const { source: _s, queryType: _q, ...rest } = row.requestOptions;

  // Collect all field names that appear in any variation
  const variationFields = new Map<string, string[]>();
  for (const variation of row.queryVariations ?? []) {
    for (const [field, values] of Object.entries(variation.fieldOverrides)) {
      const existing = variationFields.get(field) ?? [];
      for (const v of values) {
        const formatted = formatOptionValue(v);
        if (!existing.includes(formatted)) existing.push(formatted);
      }
      variationFields.set(field, existing);
    }
  }

  const result: DisplayOption[] = [];

  // Regular (non-variation) fields — skip empty values
  for (const [key, value] of Object.entries(rest)) {
    if (variationFields.has(key)) continue;
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value) && (value as unknown[]).length === 0) continue;
    result.push({ key, value });
  }

  // Variation-controlled fields
  for (const [field, allValues] of variationFields) {
    const preview = allValues.slice(0, VARIATION_PREVIEW_LIMIT);
    const moreCount = Math.max(0, allValues.length - VARIATION_PREVIEW_LIMIT);
    result.push({ key: field, variationValues: preview, moreCount });
  }

  return result;
}

function formatOptionValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
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
  .request-options-list {
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2em;
    list-style: none;

    .request-option {
      display: flex;
      gap: 0.4em;
      align-items: baseline;
      flex-wrap: wrap;

      dt {
        font-size: 0.8em;
        font-weight: 600;
        color: var(--p-text-muted-color);
        white-space: nowrap;

        &::after {
          content: ":";
        }
      }

      dd {
        margin: 0;
        font-size: 0.85em;
        word-break: break-word;
        display: flex;
        flex-wrap: wrap;
        gap: 0.25em;
        align-items: center;

        .more-count {
          font-size: 0.8em;
          color: var(--p-text-muted-color);
          white-space: nowrap;
        }
      }
    }
  }

  .no-options {
    color: var(--p-text-muted-color);
  }

  .p-datatable {
    margin-bottom: 1em;

    & .inline-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5em;
      align-items: center;
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
