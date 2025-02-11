<template>
  <div>
    <big-shot
      v-if="uiState.mediaView === 'slide-show' && slideData.length"
      :slide-data="[...slideData, ...Array(totalMedias)]"
      :initial-slide-index="initialSlideIndex"
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
      @media-click="openMediaInSlideShow"
    />
    <div class="load-info">
      <button
        v-if="(medias.length && hasNextPage) || isFetchingNextPage"
        :disabled="!hasNextPage || isFetchingNextPage"
        class="load-more"
        @click="() => fetchNextPage()"
      >
        <span v-if="isFetchingNextPage">Loading more...</span>
        <span v-else>Load More</span>
      </button>
      <div v-else>
        <span v-if="!medias.length">
          No results. Try
          <Button
            v-if="!pageSidebarWidth"
            label="Link"
            variant="link"
            @click="uiState.sidebarMobileCollapsed = false"
          >
            modifying the search
          </Button>
          <template v-else>modifying the search</template><!--
          -->.
        </span>
        <span v-else>Nothing more to load</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import 'primeicons/primeicons.css'
// @ts-expect-error -- big-shot does not have ts types yet
import BigShot from 'big-shot'
import 'big-shot/css'
import { useElementSize, useMounted } from '@vueuse/core'
import useSlideData from '~/lib/useSlideData'

const isMounted = useMounted()

const pageSidebarElm = computed<null | HTMLElement>(() => isMounted.value ? document.querySelector('#page-sidebar') : null)
const { width: pageSidebarWidth } = useElementSize(pageSidebarElm)

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
  getNextPageParam: page => page.media.length ? page.page + 1 : null,
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
const initialSlideIndex = ref(0)
function openMediaInSlideShow(media: z.infer<typeof APIMedia>) {
  const slideIndex = medias.value.findIndex(m => m === media)
  if (slideIndex === -1) {
    console.error(`Failed to get index for media: ${media.id}`)
    return
  }
  initialSlideIndex.value = slideIndex
  console.log(initialSlideIndex.value)
  uiState.mediaView = 'slide-show'
}
</script>

<style scoped>
  .load-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 1.5em 0;
  }

  .load-more {
    margin: 1em auto;
    display: block;
  }

  .pi {
    vertical-align: middle;
  }

  .big-shot {
    z-index: 3;
    position: fixed;
  }

  .p-button-link {
    padding: 0;
  }
</style>
