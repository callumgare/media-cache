<template>
  <div>
    <EditQueryForm :media-query="mediaQuery" />
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const id = typeof route.params.id === 'string' ? route.params.id : route.params.id[0]

let mediaQuery: DBMediaFinderQuery | undefined

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
definePageMeta({
  breadcrumbs: ({ route }) => ['Settings', 'Queries', ((route.params.id === 'add') ? 'Add' : 'Edit') + ' Query'],
})
</script>
