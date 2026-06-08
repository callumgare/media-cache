<script setup lang="ts">
import { useMediaQuery } from "@@/stores/media-query";
import { useSavedSearches } from "@@/stores/saved-searches";
import type { SortConfig } from "@@/types/sort-config";
import { keepPreviousData } from "@tanstack/vue-query";
import {
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
  Shuffle,
  SquareIcon,
} from "lucide-vue-next";

import type {
  APIMediaFacetsResponse,
  AspectRatioFacetCount,
  DurationFacetCount,
  FacetCount,
  FacetResult,
  FavouritedFacetCount,
  SourceFacetCount,
  TagFacetCount,
  TypeFacetCount,
} from "@@/types/api-media-facets";
import type { QuerySchemaConfig } from "@@/types/query-schema-config.js";
import type { QUERY_FIELD_DEFINITIONS } from "~~/types/query-field-definitions";

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
const savedSearches = useSavedSearches();
const confirm = useConfirm();
onMounted(() => savedSearches.init());

const hasUnsavedChanges = computed(() => {
  const snapshot = savedSearches.savedSnapshot;
  if (savedSearches.activeSearchId === null || snapshot === null) return false;
  return (
    JSON.stringify(mediaQuery.conditionNodes) !==
      JSON.stringify(snapshot.conditionNodes) ||
    JSON.stringify(mediaQuery.sort) !== JSON.stringify(snapshot.sort) ||
    JSON.stringify(mediaQuery.widgetOverrides) !==
      JSON.stringify(snapshot.widgetOverrides)
  );
});

const showReset = computed(() =>
  savedSearches.activeSearchId !== null
    ? hasUnsavedChanges.value
    : !mediaQuery.isDefault,
);

function resetQuery() {
  if (savedSearches.activeSearchId !== null) {
    savedSearches.switchTo(savedSearches.activeSearchId);
  } else {
    mediaQuery.resetToDefault();
  }
}
const mediaQueryCondition = ref(mediaQuery.condition);
mediaQuery.$subscribe(() => {
  mediaQueryCondition.value = mediaQuery.condition;
});

const editMode = ref(false);

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
  fieldOptions: {
    source: (findFieldCounts(facets.value, "source") as SourceFacetCount[])
      .map((f) => ({
        id: f.liaseSourceId,
        name: f.name ?? f.liaseSourceId,
        count: f.count,
      }))
      .sort(
        (a, b) =>
          (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name),
      ),
    tags: (findFieldCounts(facets.value, "tags") as TagFacetCount[])
      .filter(
        (option) => option.count || selectedTagIds.value.includes(option.id),
      )
      .map((option) => ({
        id: option.id,
        name: option.name,
        count: option.count,
        countAddedIfRemoved: option.countAddedIfRemoved,
      }))
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
    groups: (findFieldCounts(facets.value, "groups") as TagFacetCount[])
      .filter(
        (option) => option.count || selectedGroupIds.value.includes(option.id),
      )
      .map((option) => ({
        id: option.id,
        name: option.name,
        count: option.count,
        countAddedIfRemoved: option.countAddedIfRemoved,
      }))
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
    duration: (() => {
      const durationFacet = (
        findFieldCounts(facets.value, "duration") as DurationFacetCount[]
      )[0];
      return [
        {
          id: "min",
          name: "Min (s)",
          countAddedIfRemoved: durationFacet?.minCountAddedIfRemoved ?? null,
        },
        {
          id: "max",
          name: "Max (s)",
          countAddedIfRemoved: durationFacet?.maxCountAddedIfRemoved ?? null,
        },
      ];
    })(),
    type: [
      { id: "video", name: "Video" },
      { id: "video-with-audio", name: "Video With Audio" },
      { id: "video-without-audio", name: "Video Without Audio" },
      { id: "image", name: "Image" },
    ].map((option) => {
      const facetCount = (
        findFieldCounts(facets.value, "type") as TypeFacetCount[]
      ).find((f) => f.value === option.id);
      return {
        ...option,
        count: facetCount?.count ?? null,
        countAddedIfRemoved: facetCount?.countAddedIfRemoved ?? null,
      };
    }),
    favourited: [
      { id: "yes", name: "Yes" },
      { id: "no", name: "No" },
    ].map((option) => {
      const facetCount = (
        findFieldCounts(facets.value, "favourited") as FavouritedFacetCount[]
      ).find((f) => f.value === option.id);
      return {
        ...option,
        count: facetCount?.count ?? null,
        countAddedIfRemoved: facetCount?.countAddedIfRemoved ?? null,
      };
    }),
    aspectRatio: [
      { id: "landscape", name: "Landscape", icon: RectangleHorizontalIcon },
      { id: "square", name: "Square", icon: SquareIcon },
      { id: "portrait", name: "Portrait", icon: RectangleVerticalIcon },
    ].map((option) => {
      const facetCount = (
        findFieldCounts(facets.value, "aspectRatio") as AspectRatioFacetCount[]
      ).find((f) => f.value === option.id);
      return {
        ...option,
        count: facetCount?.count ?? null,
        countAddedIfRemoved: facetCount?.countAddedIfRemoved ?? null,
      };
    }),
    width: (() => {
      return [
        {
          id: "min",
          name: "Min",
        },
        {
          id: "max",
          name: "Max",
        },
      ];
    })(),
    height: (() => {
      return [
        {
          id: "min",
          name: "Min",
        },
        {
          id: "max",
          name: "Max",
        },
      ];
    })(),
  } satisfies Record<(typeof QUERY_FIELD_DEFINITIONS)[number]["id"], unknown[]>,
  loading: showLoading.value,
}));

const { data: mediaData } = useMediaResults();
const totalCount = computed(
  () => mediaData.value?.pages[0]?.totalCount ?? null,
);

// Save-as-new dialog
const showSaveDialog = ref(false);
const newSearchName = ref("");
const newSearchServerError = ref<string | null>(null);
const newSearchNameError = computed(() => {
  if (!newSearchName.value.trim()) return "Name is required.";
  return newSearchServerError.value;
});

watch(newSearchName, () => {
  newSearchServerError.value = null;
});

async function confirmSaveNew() {
  if (!newSearchName.value.trim()) return;
  try {
    await savedSearches.saveAsNew(newSearchName.value.trim());
    showSaveDialog.value = false;
  } catch (err: unknown) {
    const status =
      (err as { statusCode?: number })?.statusCode ??
      (err as { status?: number })?.status;
    if (status === 409) {
      newSearchServerError.value =
        "A saved search with that name already exists.";
    } else {
      throw err;
    }
  }
}

// Saved search selector options
const savedSearchOptions = computed(() => [
  ...savedSearches.searches.map((s) => ({ id: s.id, label: s.name })),
  { id: "__new__" as const, label: "Save as new search…" },
]);

function confirmDeleteActive(event: MouseEvent) {
  confirm.require({
    target: event.currentTarget as HTMLElement,
    message: `Delete saved search "${savedSearches.searches.find((s) => s.id === savedSearches.activeSearchId)?.name}"?`,
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Cancel", severity: "secondary", text: true },
    acceptProps: { label: "Delete", severity: "danger" },
    accept: () => savedSearches.deleteActive(),
  });
}

async function onSavedSearchSelect(option: { id: number | "__new__" }) {
  if (option.id === "__new__") {
    newSearchName.value = "";
    showSaveDialog.value = true;
    return;
  }
  await savedSearches.switchTo(option.id);
}

type SortOption = { label: string; value: SortConfig["field"] };
const sortOptions: SortOption[] = [
  { label: "Random", value: "random" },
  { label: "First Created/Uploaded", value: "earliestCreatedOrUploadedAt" },
  { label: "Last Updated", value: "latestUpdatedAt" },
  { label: "First Indexed", value: "firstIndexedAt" },
  { label: "Last Indexed", value: "lastIndexedAt" },
  { label: "Duration", value: "duration" },
  { label: "Title", value: "title" },
  { label: "File Size", value: "fileSize" },
  { label: "Width", value: "width" },
  { label: "Height", value: "height" },
  { label: "Aspect Ratio", value: "aspectRatio" },
];

const sortField = computed({
  get: () => mediaQuery.sort.field,
  set: (field: string) => {
    if (field === "random") {
      mediaQuery.setSort({ field: "random" });
    } else {
      const currentDir =
        mediaQuery.sort.field !== "random" ? mediaQuery.sort.direction : "desc";
      mediaQuery.setSort({
        field: field as Exclude<SortConfig, { field: "random" }>["field"],
        direction: currentDir,
      });
    }
  },
});

const sortDir = computed({
  get: () =>
    mediaQuery.sort.field !== "random" ? mediaQuery.sort.direction : "desc",
  set: (direction: "asc" | "desc") => {
    if (mediaQuery.sort.field !== "random") {
      mediaQuery.setSort({ field: mediaQuery.sort.field, direction });
    }
  },
});

function toggleSortDir() {
  sortDir.value = sortDir.value === "desc" ? "asc" : "desc";
}
</script>

<template>
  <div class="root" data-testid="filter-sidebar-root">
    <section>
      <header class="section-header"><h3>Saved Searches</h3></header>
      <div class="sidebar-header">
        <Select
          :model-value="savedSearches.activeSearchId !== null
            ? savedSearchOptions.find(o => o.id === savedSearches.activeSearchId)
            : null"
          :options="savedSearchOptions"
          option-label="label"
          placeholder="Unsaved search"
          class="search-selector"
          @update:model-value="onSavedSearchSelect"
        />
        <Button
          v-if="savedSearches.activeSearchId !== null && hasUnsavedChanges"
          icon="pi pi-save"
          size="small"
          text
          aria-label="Save changes"
          title="Save changes"
          @click="savedSearches.updateActive()"
        />
        <Button
          v-if="showReset"
          icon="pi pi-undo"
          size="small"
          severity="warn"
          text
          :aria-label="savedSearches.activeSearchId !== null ? 'Discard changes' : 'Reset to defaults'"
          :title="savedSearches.activeSearchId !== null ? 'Discard changes' : 'Reset to defaults'"
          @click="resetQuery()"
        />
        <Button
          v-if="savedSearches.activeSearchId !== null"
          icon="pi pi-trash"
          size="small"
          severity="danger"
          text
          aria-label="Delete saved search"
          title="Delete saved search"
          @click="confirmDeleteActive"
        />
        <ConfirmPopup />
      </div>
    </section>
    <section>
      <header class="section-header"><h3>Sort</h3></header>
      <div class="sort-control">
        <InputGroup>
          <Select
            v-model="sortField"
            :options="sortOptions"
            option-label="label"
            option-value="value"
            input-id="media-sort"
            aria-label="Sort by"
          />
          <InputGroupAddon v-if="sortField !== 'random'">
            <Button
              :icon="sortDir === 'desc' ? 'pi pi-sort-amount-down' : 'pi pi-sort-amount-up-alt'"
              severity="secondary"
              variant="text"
              :title="sortDir === 'desc' ? 'Descending' : 'Ascending'"
              @click="toggleSortDir"
            />
          </InputGroupAddon>
          <InputGroupAddon v-else>
            <Button
              severity="secondary"
              variant="text"
              title="Reshuffle"
              @click="mediaQuery.reshuffleRandomSeed()"
            >
              <Shuffle :size="16" />
            </Button>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </section>
    <section>
      <header class="section-header filters-header">
        <h3>Filters</h3>
        <Button
          :icon="editMode ? 'pi pi-check' : 'pi pi-pencil'"
          :aria-label="editMode ? 'Done' : 'Edit'"
          size="small"
          :severity="editMode ? 'success' : 'secondary'"
          text
          @click="editMode = !editMode"
        />
      </header>
      <ClientOnly
        fallback-tag="span"
        fallback="Loading..."
      >
        <QueryBuilderConditionTree
          v-if="editMode"
          :schema-config="querySchemaConfig"
        />
        <QueryBuilderGroupConditionInput
          v-else
          :group-condition="mediaQuery.condition"
          :schema-config="querySchemaConfig"
          :is-root="true"
        />
      </ClientOnly>
    </section>
    <Divider />
    <div v-if="totalCount !== null" class="stats">
      {{ totalCount.toLocaleString() }} result{{ totalCount === 1 ? '' : 's' }}
    </div>

    <Dialog
      v-model:visible="showSaveDialog"
      header="Save as new search"
      modal
      :style="{ width: '360px' }"
    >
      <div class="save-dialog-body">
        <FloatLabel>
          <InputText
            id="new-search-name"
            v-model="newSearchName"
            :invalid="!!newSearchNameError && newSearchName.trim() !== ''"
            fluid
            autofocus
            @keydown.enter="confirmSaveNew"
          />
          <label for="new-search-name">Name</label>
        </FloatLabel>
        <Message
          v-if="newSearchNameError && newSearchName.trim() !== ''"
          severity="error"
          size="small"
        >{{ newSearchNameError }}</Message>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="showSaveDialog = false" />
        <Button label="Save" :disabled="!!newSearchNameError" @click="confirmSaveNew" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
  .root {
    padding: 1em;

    .stats {
      font-size: 0.85rem;
      color: var(--p-text-muted-color);
      margin-bottom: 0.25rem;
      text-align: center;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      gap: 0.5em;
      margin-bottom: 0.5em;
      flex-wrap: wrap;

      .search-selector {
        flex: 1;
        min-width: 0;
      }
    }

    .sort-control {
      margin-bottom: 0.5em;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 0em;
      margin: 0.75rem 0 0.4rem;

      h3 {
        display: flex;
        align-items: center;
        gap: 0.5em;
        flex: 1 1 auto;
        margin: 0;
        font-size: 0.7rem;
        text-transform: uppercase;
        color: var(--p-text-muted-color);
        font-weight: 600;
        letter-spacing: 0.06em;

        &::before,
        &::after {
          content: '';
          height: 1px;
          background: var(--p-content-border-color);
        }

        &::before {
          width: 1em;
        }

        &::after {
          flex: 1;
        }
      }


    }

    .section-header.filters-header {
      > :last-child {
        order: 1;
      }
    }

  }

.save-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
</style>
