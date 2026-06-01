<script setup lang="ts">
import "primeicons/primeicons.css";
import { useMediaQuery } from "@@/stores/media-query";
import type { QueryFieldCondition } from "@@/types/query-condition";
import { QUERY_FIELD_DEFINITIONS } from "@@/types/query-field-definitions";
import type { QuerySchemaConfig } from "@@/types/query-schema-config.js";

const props = defineProps<{
  fieldCondition: QueryFieldCondition;
  schemaConfig: QuerySchemaConfig;
}>();
const fieldDef = computed(() =>
  QUERY_FIELD_DEFINITIONS.find((f) => f.id === props.fieldCondition.field),
);
const fieldOptions = computed(
  () => props.schemaConfig.fieldOptions[props.fieldCondition.field] ?? [],
);
const mediaQuery = useMediaQuery();

const listHeight = ref(200);
const MIN_LIST_HEIGHT = 60;
const ITEM_SIZE = 38;
const HANDLE_HEIGHT = 6;

const listContainerHeight = computed(
  () => `${Math.max(listHeight.value - HANDLE_HEIGHT, MIN_LIST_HEIGHT)}px`,
);

const filterValue = ref("");

const toast = useToast();

function toIdArray(value: unknown): (string | number)[] {
  // Empty/unset is a valid state — no selection
  if (value === "" || value === null || value === undefined) return [];
  if (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" || typeof item === "number")
  ) {
    return value;
  }
  console.error(
    "QueryBuilderInputListbox: expected an array of string/number IDs but received:",
    value,
  );
  toast.add({
    severity: "warn",
    summary: "Something unexpected happened",
    detail: "Some filters may not work correctly.",
    life: 5000,
  });
  return [];
}

const currentIds = computed(() => toIdArray(props.fieldCondition.value));

const selectedIds = computed(() => new Set(currentIds.value));

const selectedOptions = computed(() =>
  currentIds.value
    .map((id) => fieldOptions.value.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => o != null),
);

const unselectedOptions = computed(() => {
  const query = filterValue.value.toLowerCase();
  return fieldOptions.value
    .filter((o) => !selectedIds.value.has(o.id))
    .filter((o) => !query || o.name.toLowerCase().includes(query));
});

function addOption(option: { id: string | number }) {
  if (!currentIds.value.includes(option.id)) {
    mediaQuery.setFieldConditionValue(props.fieldCondition, [
      ...currentIds.value,
      option.id,
    ]);
  }
}

function removeOption(id: string | number) {
  mediaQuery.setFieldConditionValue(
    props.fieldCondition,
    currentIds.value.filter((v) => v !== id),
  );
}

function startResize(startY: number) {
  const startListHeight = listHeight.value;

  function onMove(clientY: number) {
    listHeight.value = Math.max(
      startListHeight + clientY - startY,
      MIN_LIST_HEIGHT,
    );
  }
  function onMousemove(e: MouseEvent) {
    onMove(e.clientY);
  }
  function onTouchmove(e: TouchEvent) {
    if (e.touches[0]) onMove(e.touches[0].clientY);
  }
  function cleanup() {
    window.removeEventListener("mousemove", onMousemove);
    window.removeEventListener("mouseup", cleanup);
    window.removeEventListener("touchmove", onTouchmove);
    window.removeEventListener("touchend", cleanup);
  }
  window.addEventListener("mousemove", onMousemove);
  window.addEventListener("mouseup", cleanup);
  window.addEventListener("touchmove", onTouchmove, { passive: true });
  window.addEventListener("touchend", cleanup);
}

function onResizeHandleMousedown(event: MouseEvent) {
  event.preventDefault();
  startResize(event.clientY);
}

function onResizeHandleTouchstart(event: TouchEvent) {
  if (event.touches[0]) startResize(event.touches[0].clientY);
}
</script>

<template>
  <QueryBuilderInputBase
    :field-condition="fieldCondition"
    :schema-config="schemaConfig"
  >
    <div
      class="listbox-wrapper"
    >
      <!-- Filter bar + selected items: measured so the list below gets the remaining height -->
      <div
        class="top-section"
      >
        <IconField class="filter-bar">
          <InputIcon class="pi pi-search" />
          <InputText
            v-model="filterValue"
            class="filter-input"
            :placeholder="`Search ${fieldDef?.displayName}`"
          />
          <InputIcon v-if="schemaConfig.loading" class="loading-icon pi pi-spinner pi-spin" />
        </IconField>

        <template v-if="selectedOptions.length">
          <div
            v-for="option in selectedOptions"
            :key="option.id"
            class="selected-item"
            data-testid="listbox-selected-item"
            @click="removeOption(option.id)"
          >
            <span class="option-label">
              <span class="option-name">{{ option.name }}</span>
              <QueryBuilderOptionCount
                :count="option.count ?? 0"
                :count-added-if-removed="option.countAddedIfRemoved"
              />
            </span>
          </div>
        </template>
      </div>

      <!-- Unselected options only; selection is managed externally -->
      <Listbox
        :key="fieldCondition.field"
        :options="unselectedOptions"
        option-label="name"
        data-key="id"
        :virtual-scroller-options="{ itemSize: ITEM_SIZE }"
        :style="{ '--list-height': listContainerHeight }"
        :model-value="null"
        @update:model-value="(value) => value && addOption(value)"
      >
        <template #option="{ option }">
          <span :class="['option-label', { dimmed: !option.count }]">
            <span class="option-name">{{ option.name }}</span>
            <QueryBuilderOptionCount :count="option.count ?? 0" />
          </span>
        </template>
        <template #footer>
          <div
            class="resize-handle"
            @mousedown="onResizeHandleMousedown"
            @touchstart.prevent="onResizeHandleTouchstart"
          />
        </template>
      </Listbox>
    </div>
  </QueryBuilderInputBase>
</template>

<style scoped>
  .listbox-wrapper {
    position: relative;
    min-height: 100px;
    border: 1px solid var(--p-listbox-border-color, var(--p-content-border-color));
    border: none;

    /* ── Top section ── */

    .top-section {
      .filter-bar {
        border-bottom: 1px solid var(--p-listbox-border-color, var(--p-content-border-color));
        width: 100%;

        &:deep(.p-inputtext) {
          display: block;
          box-shadow: none;
          font-family: inherit;
          font-size: inherit;
          border-radius: var(--p-listbox-border-radius) var(--p-listbox-border-radius) 0 0;
          margin-bottom: -1px;
          width: 100%;

          &:focus {
            box-shadow: none;
          }
        }
      }

      .selected-item {
        display: flex;
        align-items: center;
        padding: var(--p-listbox-option-padding, 0.5rem 0.75rem);
        cursor: pointer;
        color: var(--p-listbox-option-selected-color, var(--p-highlight-color));
        background: var(--p-listbox-option-selected-background, var(--p-highlight-background));
        border: 1px solid var(--p-inputtext-border-color);
        margin-top: -1px;

        &:hover {
          background: var(--p-listbox-option-selected-focus-background, var(--p-highlight-focus-background));
        }
      }
    }

    /* Strip the inner Listbox's own border so it blends into the wrapper */
    &:deep(.p-listbox) {
      width: 100%;
      box-shadow: none;
      border-radius: 0 0 var(--p-listbox-border-radius) var(--p-listbox-border-radius);
      margin-top: -1px;
    }

    :deep(.p-listbox-list-container) {
      height: var(--list-height) !important;
      overflow: hidden;
    }

    :deep(.p-virtualscroller) {
      height: var(--list-height) !important;
    }

    /* ── Resize handle ── */

    .resize-handle {
      position: absolute;
      bottom: 0;
      transform: translateY(50%);
      width: 100%;
      height: 6px;
      cursor: ns-resize;

      /* Visual Handle */
      &::before {
        content: "";
        display: block;
        position: absolute;
        bottom: calc(100% + 2px);
        left: 50%;
        transform: translateX(-50%);
        width: 2rem;
        height: 2px;
        border-radius: 1px;
        background: var(--p-text-muted-color);
        opacity: 0.4;
      }

      /* Larger hitbox around visual handle */
      &::after {
        content: "";
        display: block;
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        width: 3rem;
        height: 10px;
      }
    }

    :deep(.p-listbox-list-container) {
      overflow: hidden;
    }

    /* ── Option label (shared by selected section and Listbox option slot) ── */

    .option-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5em;
      flex: 1;

      &.dimmed {
        opacity: 0.4;
      }
    }

    .option-name {
      flex: 1;
    }
  }
</style>
