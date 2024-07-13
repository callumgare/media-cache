<template>
  <div>
    <PageHeader :breadcrumbs="['Settings', 'Queries', (mediaQuery ? 'Edit' : 'Add') + ' Query']" />
    <EditQueryForm :media-query="mediaQuery" />
  </div>
</template>

<script setup lang="ts">
import type { MediaFinderQuery } from '@prisma/client'

const route = useRoute()
const id = typeof route.params.id === 'string' ? route.params.id : route.params.id[0]

let mediaQuery: MediaFinderQuery | undefined

if (id === 'add') {
  mediaQuery = undefined
}
else if (id.match(/^\d+$/)) {
  mediaQuery = await $fetch(`/api/admin/queries/${id}`)
}
else {
  throw createError({
    statusCode: 404,
    message: 'not found',
    fatal: true,
  })
}
</script>
