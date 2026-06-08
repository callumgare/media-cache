import { useMediaQuery } from "@@/stores/media-query";
import { useSavedSearches } from "@@/stores/saved-searches";
import type { QueryConditionFlatNode } from "@@/types/query-condition";
import type { WidgetId } from "@@/types/query-field-type-definitions";
import type { SortConfig } from "@@/types/sort-config";
import { createPinia, setActivePinia } from "pinia";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Prevent pinia-persist-extended from touching real storage
const storageMock: Storage = {
  getItem: (_k: string) => null,
  setItem: (_k: string, _v: string) => {},
  removeItem: (_k: string) => {},
  clear: () => {},
  length: 0,
  key: (_i: number) => null,
};
if (typeof window !== "undefined") {
  try {
    Object.defineProperty(window, "localStorage", {
      value: storageMock,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "sessionStorage", {
      value: storageMock,
      configurable: true,
      writable: true,
    });
  } catch {
    /* ignore if non-configurable */
  }
}
afterAll(() => vi.unstubAllGlobals());

// ── Fixtures ──────────────────────────────────────────────────────────────

const BASE_NODES: QueryConditionFlatNode[] = [
  { id: 1, type: "group", operator: "AND", parent: null },
  {
    id: 2,
    type: "field",
    field: "tags",
    operator: "includes all",
    value: [],
    parent: 1,
  },
];
const RANDOM_SORT: SortConfig = { field: "random" };
const DATE_SORT: SortConfig = {
  field: "earliestCreatedOrUploadedAt",
  direction: "asc",
};

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Seed the saved-searches store with a snapshot that exactly matches the
 * current media-query store state, simulating what switchTo() would do.
 */
function loadSnapshot(
  savedSearches: ReturnType<typeof useSavedSearches>,
  mediaQuery: ReturnType<typeof useMediaQuery>,
  overrideId = 1,
) {
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  savedSearches.activeSearchId = overrideId;
  savedSearches._savedSnapshot = {
    conditionNodes: clone(mediaQuery.conditionNodes),
    sort: clone(mediaQuery.sort),
    widgetOverrides: clone(mediaQuery.widgetOverrides),
  };
}

/**
 * Mirrors the hasUnsavedChanges computed in MediaFilterSidebar.vue.
 * The logic lives in the component (not the store) for reliable reactivity.
 */
function hasUnsavedChanges(
  savedSearches: ReturnType<typeof useSavedSearches>,
  mediaQuery: ReturnType<typeof useMediaQuery>,
): boolean {
  const snapshot = savedSearches.savedSnapshot;
  if (savedSearches.activeSearchId === null || snapshot === null) return false;
  return (
    JSON.stringify(mediaQuery.conditionNodes) !==
      JSON.stringify(snapshot.conditionNodes) ||
    JSON.stringify(mediaQuery.sort) !== JSON.stringify(snapshot.sort) ||
    JSON.stringify(mediaQuery.widgetOverrides) !==
      JSON.stringify(snapshot.widgetOverrides)
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("saved-searches store — hasUnsavedChanges", () => {
  it("returns false when there is no active search", () => {
    const savedSearches = useSavedSearches();
    const mediaQuery = useMediaQuery();
    // activeSearchId is null by default
    expect(hasUnsavedChanges(savedSearches, mediaQuery)).toBe(false);
  });

  it("returns false when there is an active search but no snapshot yet", () => {
    const savedSearches = useSavedSearches();
    const mediaQuery = useMediaQuery();
    savedSearches.$patch({ activeSearchId: 1, _savedSnapshot: null });
    expect(hasUnsavedChanges(savedSearches, mediaQuery)).toBe(false);
  });

  it("returns false immediately after a snapshot is loaded that matches current state", () => {
    const savedSearches = useSavedSearches();
    const mediaQuery = useMediaQuery();
    loadSnapshot(savedSearches, mediaQuery);

    expect(hasUnsavedChanges(savedSearches, mediaQuery)).toBe(false);
  });

  it("returns true when conditionNodes differ from the snapshot", () => {
    const savedSearches = useSavedSearches();
    const mediaQuery = useMediaQuery();
    loadSnapshot(savedSearches, mediaQuery);

    mediaQuery.addFieldNode(1, "source");

    expect(hasUnsavedChanges(savedSearches, mediaQuery)).toBe(true);
  });

  it("returns true when a condition node is removed after the snapshot", () => {
    const savedSearches = useSavedSearches();
    const mediaQuery = useMediaQuery();
    mediaQuery.loadSavedSearch({
      conditionNodes: BASE_NODES,
      sort: RANDOM_SORT,
      widgetOverrides: {},
    });
    loadSnapshot(savedSearches, mediaQuery);

    mediaQuery.removeNode(2);

    expect(hasUnsavedChanges(savedSearches, mediaQuery)).toBe(true);
  });

  it("returns true when sort differs from the snapshot", () => {
    const savedSearches = useSavedSearches();
    const mediaQuery = useMediaQuery();
    loadSnapshot(savedSearches, mediaQuery);

    mediaQuery.setSort(DATE_SORT);

    expect(hasUnsavedChanges(savedSearches, mediaQuery)).toBe(true);
  });

  it("returns true when widgetOverrides differ from the snapshot", () => {
    const savedSearches = useSavedSearches();
    const mediaQuery = useMediaQuery();
    loadSnapshot(savedSearches, mediaQuery);

    mediaQuery.setWidgetOverride(2, "listbox");

    expect(hasUnsavedChanges(savedSearches, mediaQuery)).toBe(true);
  });

  it("returns false after a widget override is set and then cleared back to the snapshot state", () => {
    const savedSearches = useSavedSearches();
    const mediaQuery = useMediaQuery();
    loadSnapshot(savedSearches, mediaQuery);

    mediaQuery.setWidgetOverride(2, "listbox");
    expect(hasUnsavedChanges(savedSearches, mediaQuery)).toBe(true);

    mediaQuery.setWidgetOverride(2, null); // restore to empty
    expect(hasUnsavedChanges(savedSearches, mediaQuery)).toBe(false);
  });

  it("returns false after changes are saved via a new snapshot", () => {
    const savedSearches = useSavedSearches();
    const mediaQuery = useMediaQuery();
    loadSnapshot(savedSearches, mediaQuery);

    mediaQuery.addFieldNode(1, "source");
    expect(hasUnsavedChanges(savedSearches, mediaQuery)).toBe(true);

    // Simulate what updateActive does: take a new snapshot of current state
    loadSnapshot(savedSearches, mediaQuery);
    expect(hasUnsavedChanges(savedSearches, mediaQuery)).toBe(false);
  });

  it("returns false when loading a new snapshot with a different saved search id", () => {
    const savedSearches = useSavedSearches();
    const mediaQuery = useMediaQuery();
    mediaQuery.loadSavedSearch({
      conditionNodes: BASE_NODES,
      sort: RANDOM_SORT,
      widgetOverrides: {},
    });
    loadSnapshot(savedSearches, mediaQuery, 42);

    expect(hasUnsavedChanges(savedSearches, mediaQuery)).toBe(false);
  });
});
