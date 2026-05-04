<template>
  <div>
    <EditQueryForm :media-query="mediaQuery" />
  </div>
</template>

<script setup lang="ts">
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { FinderQuery } from '@@/server/database/schema'

type MediaQueryFormData = Omit<FinderQuery, 'requestOptions' | 'createdAt' | 'updatedAt'> & {
  requestOptions: Record<string, unknown>
  createdAt: Date | string
  updatedAt: Date | string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const route = useRoute()
const idParam = route.params.id
const id = typeof idParam === 'string' ? idParam : idParam?.[0]

if (!id) {
  throw createError({ statusCode: 404, message: 'not found', fatal: true })
}

let mediaQuery: MediaQueryFormData | undefined

if (id === 'add') {
  mediaQuery = undefined
}
else if (id.match(/^\d+$/)) {
  const data = await $fetch(`/api/admin/queries/${id}`)
  const requestOptions = isRecord(data.requestOptions) ? data.requestOptions : {}
  mediaQuery = { ...data, requestOptions }
}
else {
  throw createError({
    statusCode: 404,
    message: 'not found',
    fatal: true,
  })
}
definePageMeta({
  breadcrumbs: ({ route }: { route: RouteLocationNormalizedLoaded }) => ['Settings', 'Queries', ((route.params.id === 'add') ? 'Add' : 'Edit') + ' Query'],
})
</script>
