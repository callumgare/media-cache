<script setup lang="ts">
import {
  type QueryConditionFlatFieldNode,
  useMediaQuery,
} from "@@/stores/media-query";
import { useUiState } from "@@/stores/ui";
import type { APIMediaResponse } from "@@/types/api-media";
import {
  refDebounced,
  useInfiniteScroll,
  useMounted,
  useResizeObserver,
} from "@vueuse/core";
import { Shuffle } from "lucide-vue-next";
import type { MenuItem } from "primevue/menuitem";
import type { z } from "zod";

const route = useRoute();
const groupId = computed(() => Number(route.params.id));

definePageMeta({
  breadcrumbs: ["Groups", ""],
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

type GroupDetail = {
  id: number;
  name: string;
  parentId: number | null;
  childGroupCount: number;
  mediaCount: number;
  ancestors: Array<{ id: number; name: string }>;
};

// Group details (name, childGroupCount, mediaCount, ancestors)
const { data: group, error: groupError } = await useFetch<GroupDetail>(
  () => `/api/groups/${route.params.id}`,
  { server: false },
);

// Build full hierarchical breadcrumb: Groups > ancestor > ... > group name
watchEffect(() => {
  if (!group.value) return;
  const crumbs: MenuItem[] = [
    { label: "Groups", route: "/groups" },
    ...group.value.ancestors.map((a) => ({
      label: a.name,
      route: `/group/${a.id}`,
    })),
    { label: group.value.name },
  ];
  const last = crumbs.at(-1);
  if (last) last.visible = false;
  route.meta.breadcrumbs = crumbs;
});

const isMounted = useMounted();

// Child groups with search + infinite scroll
const subgroupSearch = ref("");
const debouncedSubgroupSearch = refDebounced(subgroupSearch, 300);

type SortOption = { label: string; value: string };
const sortOptions: SortOption[] = [
  { label: "Name", value: "name" },
  { label: "Count (Subgroups + Media)", value: "total" },
  { label: "Count (Subgroups)", value: "subgroups" },
  { label: "Count (Media)", value: "media" },
  { label: "Random", value: "random" },
];
const subgroupSort = ref("total");
const subgroupSortDir = ref<"asc" | "desc">("desc");
const subgroupSortSeed = ref(Math.floor(Math.random() * 1000000));

function toggleSortDir() {
  subgroupSortDir.value = subgroupSortDir.value === "desc" ? "asc" : "desc";
}

function reshuffleSortSeed() {
  subgroupSortSeed.value = Math.floor(Math.random() * 1000000);
}

const {
  data: childGroupData,
  fetchNextPage: fetchNextChildPage,
  isPending: childGroupsPending,
  isFetchingNextPage: fetchingMoreChildren,
  hasNextPage: hasMoreChildren,
} = useInfiniteQuery({
  queryKey: computed(() => [
    "groups",
    "children",
    groupId.value,
    debouncedSubgroupSearch.value,
    subgroupSort.value,
    subgroupSortDir.value,
    subgroupSort.value === "random" ? subgroupSortSeed.value : null,
  ]),
  queryFn: ({ pageParam }) =>
    $fetch<GroupsResponse>("/api/groups", {
      query: {
        parentId: groupId.value,
        page: pageParam,
        sort: subgroupSort.value,
        dir: subgroupSortDir.value,
        ...(subgroupSort.value === "random"
          ? { seed: subgroupSortSeed.value }
          : {}),
        ...(debouncedSubgroupSearch.value
          ? { search: debouncedSubgroupSearch.value }
          : {}),
      },
    }),
  initialPageParam: 1,
  getNextPageParam: (lastPage) =>
    lastPage.groups.length < lastPage.pageSize ? null : lastPage.page + 1,
  enabled: isMounted,
});

const childGroups = computed(
  () => childGroupData.value?.pages.flatMap((p) => p.groups) ?? [],
);

const nextPageSkeletonCount = computed(() => {
  if (childGroupsPending.value) return 3;
  if (!fetchingMoreChildren.value) return 0;
  const totalCount = childGroupData.value?.pages[0]?.totalCount ?? 0;
  const pageSize = childGroupData.value?.pages[0]?.pageSize ?? 20;
  const remaining = totalCount - childGroups.value.length;
  return Math.min(remaining, pageSize);
});

const nextMediaSkeletonCount = computed(() => {
  if (!fetchingMoreMedia.value) return 0;
  const totalCount = mediaQueryData.value?.pages[0]?.totalCount ?? 0;
  const pageSize = mediaQueryData.value?.pages[0]?.pageSize ?? 20;
  const remaining = totalCount - medias.value.length;
  return Math.min(remaining, pageSize);
});

// Media with infinite scroll
const randomSeed = Math.floor(Math.random() * 1000000);
const {
  data: mediaQueryData,
  fetchNextPage: fetchNextMediaPage,
  isFetchingNextPage: fetchingMoreMedia,
  hasNextPage: hasMoreMedia,
} = useInfiniteQuery({
  queryKey: computed(() => ["media", "group", groupId.value]),
  queryFn: ({ pageParam }) =>
    $fetch<z.infer<typeof APIMediaResponse>>("/api/media", {
      method: "POST",
      query: { page: pageParam, seed: randomSeed },
      body: {
        id: 1,
        type: "group",
        operator: "AND",
        conditions: [
          {
            id: 2,
            type: "field",
            field: "groups",
            operator: "includes all",
            value: [String(groupId.value)],
          },
        ],
      },
    }),
  initialPageParam: 1,
  getNextPageParam: (lastPage) =>
    lastPage.media.length < lastPage.pageSize ? null : lastPage.page + 1,
  enabled: isMounted,
});

const medias = computed(
  () => mediaQueryData.value?.pages.flatMap((p) => p.media) ?? [],
);

// Single scroll container drives both lists; child groups load first, media after
const scrollContainer = ref<HTMLElement | null>(null);
onMounted(() => {
  scrollContainer.value = document.querySelector(".base-layout-contents");
});

const { reset: resetInfiniteScroll } = useInfiniteScroll(
  scrollContainer,
  async () => {
    if (hasMoreChildren.value && !fetchingMoreChildren.value) {
      await fetchNextChildPage();
    } else if (hasMoreMedia.value && !fetchingMoreMedia.value) {
      await fetchNextMediaPage();
    }
    await nextTick();
  },
  {
    distance: 200,
    canLoadMore: () =>
      (hasMoreChildren.value || hasMoreMedia.value) &&
      !fetchingMoreChildren.value &&
      !fetchingMoreMedia.value,
  },
);
useResizeObserver(scrollContainer, () => resetInfiniteScroll());

const mediaQuery = useMediaQuery();
const uiState = useUiState();

function openOnMediaPage() {
  let groupsNode = mediaQuery.conditionNodes.find(
    (n): n is QueryConditionFlatFieldNode =>
      n.type === "field" && n.field === "groups",
  );
  if (!groupsNode) {
    const rootNode = mediaQuery.conditionNodes.find((n) => n.parent === null);
    const maxId = Math.max(...mediaQuery.conditionNodes.map((n) => n.id));
    const newNode = {
      id: maxId + 1,
      type: "field",
      field: "groups",
      operator: "includes all",
      value: "",
      parent: rootNode?.id ?? 1,
    } as const;
    mediaQuery.conditionNodes.push(newNode);
    groupsNode = newNode;
  }
  mediaQuery.setFieldConditionValue(groupsNode, [groupId.value]);
  navigateTo(`/media/${uiState.lastMediaView}`);
}
</script>

<template>
  <div class="group-page">
    <div v-if="groupError" class="error">Group not found.</div>
    <template v-else>
      <!-- Stats bar -->
      <div v-if="group" class="stats-bar">
        <span>{{ (group.childGroupCount ?? 0).toLocaleString() }} {{ group.childGroupCount === 1 ? "subgroup" : "subgroups" }}</span>
        <span class="divider">·</span>
        <span>{{ (group.mediaCount ?? 0).toLocaleString() }} {{ group.mediaCount === 1 ? "media item" : "media items" }}</span>
      </div>

      <!-- Child groups section -->
      <section v-if="group?.childGroupCount || subgroupSearch" class="child-groups">
        <div class="section-toolbar">
          <h2>Subgroups</h2>
          <InputText
            v-model="subgroupSearch"
            placeholder="Search…"
            class="search-input"
          />
          <div class="sort-control">
            <label for="subgroup-sort" class="p-sr-only">Sort by</label>
            <InputGroup>
              <Select
                v-model="subgroupSort"
                :options="sortOptions"
                option-label="label"
                option-value="value"
                input-id="subgroup-sort"
              />
              <InputGroupAddon v-if="subgroupSort !== 'random'">
                <Button
                  :icon="subgroupSortDir === 'desc' ? 'pi pi-sort-amount-down' : 'pi pi-sort-amount-up-alt'"
                  severity="secondary"
                  variant="text"
                  :title="subgroupSortDir === 'desc' ? 'Descending' : 'Ascending'"
                  @click="toggleSortDir"
                />
              </InputGroupAddon>
              <InputGroupAddon v-else>
                <Button
                  severity="secondary"
                  variant="text"
                  title="Reshuffle"
                  @click="reshuffleSortSeed"
                >
                  <Shuffle :size="16" />
                </Button>
              </InputGroupAddon>
            </InputGroup>
          </div>
        </div>

        <div v-if="childGroupsPending" class="groups-grid">
          <Skeleton v-for="i in 3" :key="i" class="group-card-skeleton" />
        </div>
        <template v-else>
          <div v-if="!childGroups.length" class="empty">
            {{ subgroupSearch ? "No subgroups match your search." : "No subgroups." }}
          </div>
          <div v-else class="groups-grid">
            <GroupCard v-for="g in childGroups" :key="g.id" :group="g" />
            <template v-if="fetchingMoreChildren">
              <Skeleton v-for="i in nextPageSkeletonCount" :key="`skel-${i}`" class="group-card-skeleton" />
            </template>
          </div>
        </template>
      </section>

      <!-- Media section -->
      <section v-if="group?.mediaCount" class="media-section">
        <div class="section-toolbar">
          <h2>Media</h2>
          <Button variant="link" @click="openOnMediaPage">Open on Media page</Button>
        </div>
        <MediaList :medias="medias" :loading-count="nextMediaSkeletonCount" :total="group?.mediaCount" />
      </section>

      <div
        v-if="!group?.childGroupCount && !group?.mediaCount && !childGroupsPending"
        class="empty"
      >
        This group is empty.
      </div>
    </template>
  </div>
</template>

<style scoped>
  .group-page {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .stats-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: var(--p-text-muted-color);

    .divider {
      opacity: 0.5;
    }
  }

  .section-toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;

    h2 {
      margin: 0;
    }
  }

  .search-input {
    flex: 1;
    max-width: 280px;
  }

  .sort-control {
    max-width: 310px;
    display: flex;
    align-items: center;
    gap: 0.5rem;

    label {
      flex: 0 0 auto;
    }
  }

  .groups-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .group-card-skeleton {
    width: 180px !important;
    height: 180px !important;
    border-radius: 8px !important;
  }


</style>
