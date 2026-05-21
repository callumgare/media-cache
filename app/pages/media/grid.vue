<template>
  <NuxtLayout name="with-sidebar">
    <template #header-center>
      <MediaViewSwitcher />
    </template>
    <div>
    <MediaList
      :medias="medias"
      :loading-count="mediaSkeletonCount"
      :total="totalMedias"
      @change="beforeSlideChangeHook"
    />
    <div class="load-info">
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
  </NuxtLayout>
</template>

<script setup lang="ts">
import "primeicons/primeicons.css";
import { useUiState } from "@@/stores/ui";
import {
  useElementSize,
  useInfiniteScroll,
  useMounted,
  useResizeObserver,
} from "@vueuse/core";

const isMounted = useMounted();

const pageSidebarElm = computed<null | HTMLElement>(() =>
  isMounted.value ? document.querySelector("#page-sidebar") : null,
);
const { width: pageSidebarWidth } = useElementSize(pageSidebarElm);

definePageMeta({
  layout: false,
  breadcrumbs: [],
});
const uiState = useUiState();

const {
  data,
  fetchNextPage,
  isPending,
  isFetchingNextPage,
  hasNextPage,
  error: mediaError,
  medias,
} = useMediaResults();

const scrollContainer = ref<HTMLElement | null>(null);

onMounted(() => {
  scrollContainer.value = document.querySelector(".page");
});

const { reset: resetInfiniteScroll } = useInfiniteScroll(
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
useResizeObserver(scrollContainer, () => resetInfiniteScroll());

const totalMedias = computed(() => data.value?.pages[0]?.totalCount ?? 0);

const mediaSkeletonCount = computed(() => {
  if (isPending.value) return data.value?.pages[0]?.pageSize ?? 10;
  if (!isFetchingNextPage.value) return 0;
  const pageSize = data.value?.pages[0]?.pageSize ?? 10;
  const remaining = totalMedias.value - medias.value.length;
  return Math.min(remaining, pageSize);
});

function beforeSlideChangeHook({ newIndex }: { newIndex: number }) {
  if (newIndex > medias.value.length - 5) {
    fetchNextPage();
  }
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
