<template>
  <div>
    <media-swipe
      :slides="slideData"
      :total="totalMedias"
      @change="beforeSlideChangeHook"
    />
    <MediaList
      :medias="medias"
      @media-click="openMediaInSlideShow"
    />
    <div class="load-info">
      <button
        v-if="(medias.length && hasNextPage) || isPending"
        :disabled="isPending"
        class="load-more"
        @click="() => fetchNextPage()"
      >
        <span v-if="isPending">Loading more...</span>
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

const mediaSwipeOpen = useMediaSwipeOpen()

const uiState = useUiState()

mediaQuery.$subscribe(() => {
  mediaQueryCondition.value = mediaQuery.condition
})
const { randomSeed } = storeToRefs(uiState)
const { data, fetchNextPage, isPending, hasNextPage } = useInfiniteQuery({
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

function openMediaInSlideShow(media: z.infer<typeof APIMedia>) {
  const slideIndex = medias.value.findIndex(m => m === media)
  if (slideIndex === -1) {
    console.error(`Failed to get index for media: ${media.id}`)
    return
  }
  mediaSwipeOpen(slideIndex)
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

  .p-button-link {
    padding: 0;
  }
</style>
