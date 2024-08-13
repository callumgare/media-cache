<template>
  <div>
    <MediaList
      :medias="medias"
    />
    <Paginator
      v-model:first="currentPageIndex"
      :rows="1"
      :total-records="totalMedias"
    />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'with-sidebar',
  breadcrumbs: [],
})
const mediaQuery = useMediaQuery()
const mediaQueryCondition = ref(mediaQuery.condition)

mediaQuery.$subscribe(() => {
  mediaQueryCondition.value = mediaQuery.condition
})
const currentPageIndex = ref(0)
const currentPage = computed(() => currentPageIndex.value + 1)
const { data } = useQuery({
  queryKey: ['media', currentPage, mediaQueryCondition],
  queryFn: () => $fetch(
    '/api/media',
    { query: { page: currentPage.value }, method: 'POST', body: mediaQueryCondition.value },
  ),
})

const medias = computed(() => data.value?.media || [])
const totalMedias = computed(() => Math.ceil((data.value?.totalCount || 0) / 10))
</script>
