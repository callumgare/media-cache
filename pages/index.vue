<template>
  <div>
    <big-shot
      v-if="uiState.mediaView === 'slide-show' && slideData.length"
      :slide-data="[...slideData, ...Array(totalMedias)]"
      @before-slide-change-hook="beforeSlideChangeHook"
    >
      <template #center-header>
        <button
          @click="uiState.mediaView = 'grid'"
        >
          <i class="pi pi-times" />
        </button>
      </template>
    </big-shot>
    <MediaList
      :medias="medias"
    />
    <button
      :disabled="!hasNextPage || isFetchingNextPage"
      class="load-more"
      @click="() => fetchNextPage()"
    >
      <span v-if="isFetchingNextPage">Loading more...</span>
      <span v-else-if="hasNextPage">Load More</span>
      <span v-else>Nothing more to load</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import 'primeicons/primeicons.css'
// @ts-expect-error -- big-shot does not have ts types yet
import BigShot from 'big-shot'
import 'big-shot/css'
import useSlideData from '~/lib/useSlideData'

definePageMeta({
  layout: 'with-sidebar',
  breadcrumbs: [],
})
const mediaQuery = useMediaQuery()
const mediaQueryCondition = ref(mediaQuery.condition)

if (typeof window === 'object') {
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') uiState.mediaView = 'grid'
  })
}

const uiState = useUiState()

mediaQuery.$subscribe(() => {
  mediaQueryCondition.value = mediaQuery.condition
})
const { randomSeed } = storeToRefs(uiState)
const { data, fetchNextPage, isFetchingNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['media', mediaQueryCondition, randomSeed],
  queryFn: ({ pageParam }) => $fetch(
    '/api/media',
    { query: { page: pageParam, seed: uiState.randomSeed }, method: 'POST', body: mediaQueryCondition.value },
  ),
  initialPageParam: 1,
  getNextPageParam: page => page.page + 1,
  getPreviousPageParam: page => page.page - 1,
})

const medias = computed(() => data.value?.pages.map(page => page.media).flat() || [])
const totalMedias = computed(() => Math.ceil((data.value?.pages?.[0].totalCount || 0) / 10))

const slideData = useSlideData(medias)

function beforeSlideChangeHook({ newIndex }: { newIndex: number }) {
  if (newIndex > (medias.value.length - 5)) {
    fetchNextPage()
  }
}
</script>

<style scoped>
  .load-more {
    margin: 1em auto;
    display: block;
  }

  .pi {
    vertical-align: middle;
  }

  .big-shot {
    z-index: 1;
    position: fixed;
  }
</style>
