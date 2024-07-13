<template>
  <DataTable
    :value="queryList"
    data-key="id"
    table-style="min-width: 50rem"
    :pt="{ bodyRow: options => ({ id: 'query-' + options.props.rowData.id }) }"
  >
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
  </DataTable>
</template>

<script setup lang="ts">
import { type MediaFinderQuery } from '@prisma/client'

const toast = useToast()

const { data: queryList, error: finderDetailsError, refresh: refreshQueryList } = await useFetch('/api/admin/queries')

if (finderDetailsError.value) {
  throw finderDetailsError.value
}

async function runQuery(query: MediaFinderQuery) {
  try {
    await $fetch(`/api/admin/queries/${query.id}/run`)
    toast.add({ severity: 'success', summary: 'Started', life: 3000 })
  }
  catch (error) {
    console.error(error)
    toast.add({ severity: 'error', summary: 'Failed', detail: error.message, life: 3000 })
  }
}
async function deleteQuery(query: MediaFinderQuery) {
  try {
    await $fetch(`/api/admin/queries/${query.id}`, { method: 'DELETE' })
    await refreshQueryList()
    toast.add({ severity: 'success', summary: 'Deleted', life: 3000 })
  }
  catch (error) {
    console.error(error)
    toast.add({ severity: 'error', summary: 'Failed', detail: error.message, life: 3000 })
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
</style>
