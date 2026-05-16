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
      <span v-if="isPending || isFetchingNextPage">Loading...</span>
      <div v-if="mediaError">
        <span class="pi pi-exclamation-triangle" />
        An error occurred while loading media.
      </div>
      <div v-else>
        <span v-if="!medias.length && !isPending">
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
        <span v-else-if="medias.length && !hasNextPage && !isPending">Nothing more to load</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import "primeicons/primeicons.css";
import { useMediaQuery } from "@@/stores/media-query";
import { useUiState } from "@@/stores/ui";
import type { APIMedia, APIMediaResponse } from "@@/types/api-media";
import { useElementSize, useInfiniteScroll, useMounted } from "@vueuse/core";
import type z from "zod";
import useSlideData from "~/lib/useSlideData";

const isMounted = useMounted();

const pageSidebarElm = computed<null | HTMLElement>(() =>
  isMounted.value ? document.querySelector("#page-sidebar") : null,
);
const { width: pageSidebarWidth } = useElementSize(pageSidebarElm);

definePageMeta({
  layout: "with-sidebar",
  breadcrumbs: [],
});
const mediaQuery = useMediaQuery();
const mediaQueryCondition = ref(mediaQuery.condition);

const mediaSwipeOpen = useMediaSwipeOpen();

const uiState = useUiState();

mediaQuery.$subscribe(() => {
  mediaQueryCondition.value = mediaQuery.condition;
});
const { randomSeed } = storeToRefs(uiState);
const {
  data,
  fetchNextPage,
  isPending,
  isFetchingNextPage,
  hasNextPage,
  error: mediaError,
} = useInfiniteQuery({
  queryKey: ["media", mediaQueryCondition, randomSeed],
  queryFn: ({ pageParam }) =>
    $fetch<z.infer<typeof APIMediaResponse>>("/api/media", {
      query: { page: pageParam, seed: uiState.randomSeed },
      method: "POST",
      body: mediaQueryCondition.value,
    }),
  initialPageParam: 1,
  getNextPageParam: (page) => (page.media.length ? page.page + 1 : null),
  getPreviousPageParam: (page) => page.page - 1,
  // Don't fetch until after mount so the initial client state matches the
  // server-rendered HTML (both empty), preventing Vue hydration mismatches.
  enabled: isMounted,
});

const scrollContainer = ref<HTMLElement | null>(null);

onMounted(() => {
  scrollContainer.value = document.querySelector(".page");
});

useInfiniteScroll(
  scrollContainer,
  async () => {
    await fetchNextPage();
    await nextTick();
  },
  {
    distance: 200,
    canLoadMore: () => hasNextPage.value && !isFetchingNextPage.value,
  },
);

const medias = computed(
  () => data.value?.pages.flatMap((page) => page.media) || [],
);
const totalMedias = computed(() => data.value?.pages[0]?.totalCount ?? 0);

const slideData = useSlideData(medias);

function beforeSlideChangeHook({ newIndex }: { newIndex: number }) {
  if (newIndex > medias.value.length - 5) {
    fetchNextPage();
  }
}

function openMediaInSlideShow(media: z.infer<typeof APIMedia>) {
  const slideIndex = slideData.value.findIndex(
    (slide) => slide.mediaData?.id === media.id,
  );
  if (slideIndex === -1) {
    console.error(`Failed to get index for media: ${media.id}`);
    return;
  }
  mediaSwipeOpen(slideIndex);
}
</script>

<style scoped>
  .load-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 1.5em 0;
  }

  .pi {
    vertical-align: middle;
  }

  .p-button-link {
    padding: 0;
  }
</style>
