<script setup lang="ts">
import { useInfiniteScroll, useMounted, useResizeObserver } from "@vueuse/core";

definePageMeta({
  ssr: false,
  breadcrumbs: ["Groups"],
});

type GroupsResponse = Awaited<
  ReturnType<
    typeof $fetch<{
      groups: Array<{
        id: number;
        name: string;
        previewImages: string[];
        subgroupCount: number;
        mediaCount: number;
      }>;
      totalCount: number;
      page: number;
      pageSize: number;
    }>
  >
>;

const isMounted = useMounted();

const { data, fetchNextPage, isPending, isFetchingNextPage, hasNextPage } =
  useInfiniteQuery({
    queryKey: ["groups", "top-level"],
    queryFn: ({ pageParam }) =>
      $fetch<GroupsResponse>("/api/groups", {
        query: {
          page: pageParam,
        },
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.groups.length < lastPage.pageSize ? null : lastPage.page + 1,
    enabled: isMounted,
  });

const groups = computed(() => data.value?.pages.flatMap((p) => p.groups) ?? []);

const scrollContainer = ref<HTMLElement | null>(null);
onMounted(() => {
  scrollContainer.value = document.querySelector(".base-layout-contents");
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
</script>

<template>
  <div class="groups-page">
    <div class="toolbar">
    </div>

    <div v-if="isPending" class="loading">Loading…</div>
    <template v-else>
      <div v-if="!groups.length" class="empty">
        No groups found.
      </div>
      <div v-else class="groups-grid">
        <GroupCard v-for="group in groups" :key="group.id" :group="group" />
      </div>
      <div class="load-info">
        <span v-if="isFetchingNextPage">Loading more…</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
  .groups-page {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .stats {
    color: var(--p-text-muted-color);
    font-size: 0.9rem;
    min-width: 6ch;
  }

  .groups-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .load-info {
    color: var(--p-text-muted-color);
    font-size: 0.85rem;
    text-align: center;
    padding: 0.5rem 0;
  }
</style>

