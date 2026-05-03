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
          v-else
          :class="['status-badge', statusClass(slotProps.data)]"
        >
          {{ statusLabel(slotProps.data) }}
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
      <ExecutionDetails
        :fetch-count-limit="slotProps.data.fetchCountLimit"
        :active-task="activeTaskForQuery(slotProps.data.id)"
        :last-task="lastTaskForQuery(slotProps.data.id)"
      />
    </template>
  </DataTable>
</template>

<script setup lang="ts">
import type { QueryExecutionTask } from '@/composables/useExecutionEvents'

const toast = useToast()
const route = useRoute()

const { data: queryList, error: finderDetailsError, refresh: refreshQueryList } = await useFetch('/api/admin/queries')

if (finderDetailsError.value) {
  throw finderDetailsError.value
}

type QueryRow = NonNullable<typeof queryList.value>[number]

const { tasks, tasksLoaded } = useTasks()

function activeTaskForQuery(queryId: number): QueryExecutionTask | null {
  for (const task of tasks.value.values()) {
    if (task.type !== 'query_execution') continue
    const qet = task as QueryExecutionTask
    if (qet.queryId === queryId && qet.finishedAt === null) return qet
  }
  return null
}

function lastTaskForQuery(queryId: number): QueryExecutionTask | null {
  let best: QueryExecutionTask | null = null
  for (const task of tasks.value.values()) {
    if (task.type !== 'query_execution') continue
    const qet = task as QueryExecutionTask
    if (qet.queryId !== queryId || qet.finishedAt === null) continue
    if (!best || qet.startedAt > best.startedAt) best = qet
  }
  return best
}

function statusLabel(query: QueryRow): string {
  if (activeTaskForQuery(query.id)) return 'Running…'
  const last = lastTaskForQuery(query.id)
  if (!last) return 'Never run'
  if (last.error || last.status === 'failed') return 'Failed'
  return 'Completed'
}

function statusClass(query: QueryRow): string {
  if (activeTaskForQuery(query.id)) return 'running'
  const last = lastTaskForQuery(query.id)
  if (!last) return 'never'
  if (last.error || last.status === 'failed') return 'failed'
  return 'completed'
}
const expandedRows = ref<Record<string, boolean>>({})

onMounted(() => {
  const expandId = route.query.expandQuery
  if (expandId) {
    expandedRows.value = { [String(expandId)]: true }
    const el = document.getElementById(`query-${expandId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})

async function runQuery(query: QueryRow) {
  try {
    await $fetch(`/api/admin/queries/${query.id}/run`)
    toast.add({ severity: 'success', summary: 'Started', life: 3000 })
    expandedRows.value = { ...expandedRows.value, [String(query.id)]: true }
  }
  catch (error) {
    console.error(error)
    toast.add({ severity: 'error', summary: 'Failed', detail: (error as Error).message, life: 3000 })
  }
}

async function deleteQuery(query: QueryRow) {
  try {
    await $fetch(`/api/admin/queries/${query.id}`, { method: 'DELETE' })
    await refreshQueryList()
    toast.add({ severity: 'success', summary: 'Deleted', life: 3000 })
  }
  catch (error) {
    console.error(error)
    toast.add({ severity: 'error', summary: 'Failed', detail: (error as Error).message, life: 3000 })
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
