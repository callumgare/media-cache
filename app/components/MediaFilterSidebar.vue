<script setup lang="ts">
import { useMediaQuery } from "@@/stores/media-query";
import { useUiState } from "@@/stores/ui";
import { keepPreviousData } from "@tanstack/vue-query";
import { Shuffle } from "lucide-vue-next";

const uiState = useUiState();
import type {
  APIMediaFacetsResponse,
  FacetCount,
  FacetResult,
  SourceFacetCount,
  TagFacetCount,
  TypeFacetCount,
} from "@@/types/api-media-facets";
import type { QuerySchemaConfig } from "@@/types/query-schema-config.js";

function findFieldCounts(
  facets: FacetResult | null | undefined,
  field: string,
): FacetCount[] {
  if (!facets) return [];
  if (facets.type === "field")
    return facets.field === field ? facets.counts : [];
  for (const condition of facets.conditions) {
    const found = findFieldCounts(condition, field);
    if (found.length > 0) return found;
  }
  return [];
}

const mediaQuery = useMediaQuery();
const mediaQueryCondition = ref(mediaQuery.condition);
mediaQuery.$subscribe(() => {
  mediaQueryCondition.value = mediaQuery.condition;
});

const selectedTagIds = computed<number[]>(() => {
  const tagsNode = mediaQuery.conditionNodes.find(
    (node) => node.type === "field" && node.field === "tags",
  );
  if (!tagsNode || tagsNode.type !== "field") return [];
  const value = tagsNode.value;
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is number => typeof id === "number");
});

const selectedGroupIds = computed<number[]>(() => {
  const groupsNode = mediaQuery.conditionNodes.find(
    (node) => node.type === "field" && node.field === "groups",
  );
  if (!groupsNode || groupsNode.type !== "field") return [];
  const value = groupsNode.value;
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is number => typeof id === "number");
});

const { data: facets, isFetching } = useQuery({
  queryKey: ["media-facets", mediaQueryCondition],
  enabled: import.meta.client,
  placeholderData: keepPreviousData,
  queryFn: () =>
    $fetch<APIMediaFacetsResponse>("/api/media-facets", {
      method: "POST",
      body: mediaQueryCondition.value,
    }),
});

// Only show the loading indicator if the fetch takes longer than 500 ms,
// to avoid a flash for fast responses. Clears immediately when done.
const showLoading = ref(false);
let loadingTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  isFetching,
  (fetching) => {
    if (fetching) {
      loadingTimer = setTimeout(() => {
        showLoading.value = true;
      }, 500);
    } else {
      if (loadingTimer !== null) {
        clearTimeout(loadingTimer);
        loadingTimer = null;
      }
      showLoading.value = false;
    }
  },
  { immediate: true },
);
onUnmounted(() => {
  if (loadingTimer !== null) clearTimeout(loadingTimer);
});

const querySchemaConfig = computed<QuerySchemaConfig>(() => ({
  availableFields: [
    {
      id: "source",
      displayName: "Source",
      type: "text",
      availableOptions: (
        findFieldCounts(facets.value, "source") as SourceFacetCount[]
      )
        .map((f) => ({
          id: f.liaseSourceId,
          name: f.name ?? f.liaseSourceId,
          count: f.count,
        }))
        .sort(
          (a, b) =>
            (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name),
        ),
    },
    {
      id: "tags",
      displayName: "Tags",
      type: "list of text",
      availableOptions: (
        findFieldCounts(facets.value, "tags") as TagFacetCount[]
      )
        .filter(
          (option) => option.count || selectedTagIds.value.includes(option.id),
        )
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
    },
    {
      id: "groups",
      displayName: "Groups",
      type: "list of text",
      availableOptions: (
        findFieldCounts(facets.value, "groups") as TagFacetCount[]
      )
        .filter(
          (option) =>
            option.count || selectedGroupIds.value.includes(option.id),
        )
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
    },
    {
      id: "duration",
      displayName: "Duration",
      type: "number range",
    },
    {
      id: "type",
      displayName: "Type",
      type: "text",
      availableOptions: [
        { id: "video", name: "Video" },
        { id: "video-with-audio", name: "Video With Audio" },
        { id: "video-without-audio", name: "Video Without Audio" },
        { id: "image", name: "Image" },
      ].map((option) => ({
        ...option,
        count:
          (findFieldCounts(facets.value, "type") as TypeFacetCount[]).find(
            (f) => f.value === option.id,
          )?.count ?? null,
      })),
    },
  ],
  fieldTypes: [
    {
      name: "text",
      operators: ["equals"],
      getInputType: () => "dropdown",
    },
    {
      name: "list of text",
      operators: ["includes all"],
      getInputType: () => "multi-select dropdown",
    },
    {
      name: "number range",
      operators: ["is between"],
      getInputType: () => "number range",
    },
  ],
  loading: showLoading.value,
}));
</script>

<template>
  <div class="root" data-testid="filter-sidebar-root">
    <div class="sidebar-header">
      <Button
        :label="uiState.debugMode ? `seed: ${uiState.randomSeed}` : undefined"
        severity="secondary"
        text
        @click="uiState.randomSeed = Math.floor(Math.random() * (100000 - 1))"
      >
        <template #icon>
          <Shuffle :size="20" />
        </template>
      </Button>
    </div>
    <ClientOnly
      fallback-tag="span"
      fallback="Loading..."
    >
      <QueryBuilderGroupConditionInput
        :group-condition="mediaQuery.condition"
        :schema-config="querySchemaConfig"
      />
    </ClientOnly>
  </div>
</template>

<style scoped>
  .root {
    padding: 1em;

    .sidebar-header {
      display: flex;
      justify-content: flex-start;
      margin-bottom: 0.5em;
    }
  }
</style>
