import type { SavedSearch } from "@@/server/database/schema";
import type { QueryConditionFlatNode } from "@@/types/query-condition";
import type { WidgetId } from "@@/types/query-field-type-definitions";
import type { SortConfig } from "@@/types/sort-config";
import { defineStore } from "pinia";
import { useMediaQuery } from "./media-query";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type SavedSnapshot = {
  conditionNodes: QueryConditionFlatNode[];
  sort: SortConfig;
  widgetOverrides: Record<number, WidgetId>;
};

export const useSavedSearches = defineStore("saved-searches", {
  state: (): {
    searches: SavedSearch[];
    activeSearchId: number | null;
    _initialized: boolean;
    _savedSnapshot: SavedSnapshot | null;
  } => ({
    searches: [],
    activeSearchId: null,
    _initialized: false,
    _savedSnapshot: null,
  }),

  getters: {
    savedSnapshot(): SavedSnapshot | null {
      return this._savedSnapshot;
    },
  },

  actions: {
    async init() {
      if (this._initialized) return;
      const data = await $fetch<SavedSearch[]>("/api/user/saved-searches");
      this.searches = data;
      this._initialized = true;
      // Restore snapshot for the persisted active search so hasUnsavedChanges
      // works correctly after a page reload.
      if (this.activeSearchId !== null && this._savedSnapshot === null) {
        const active = data.find((s) => s.id === this.activeSearchId);
        if (active) {
          this._savedSnapshot = {
            conditionNodes: deepClone(active.conditionNodes),
            sort: deepClone(active.sort),
            widgetOverrides: deepClone(active.widgetOverrides),
          };
        }
      }
    },

    async switchTo(id: number) {
      const search = this.searches.find((s) => s.id === id);
      if (!search) return;
      const mediaQuery = useMediaQuery();
      mediaQuery.loadSavedSearch({
        conditionNodes: search.conditionNodes,
        sort: search.sort,
        widgetOverrides: search.widgetOverrides,
      });
      this.activeSearchId = id;
      this._savedSnapshot = {
        conditionNodes: deepClone(search.conditionNodes),
        sort: deepClone(search.sort),
        widgetOverrides: deepClone(search.widgetOverrides),
      };
    },

    async saveAsNew(name: string) {
      const mediaQuery = useMediaQuery();
      const result = await $fetch<SavedSearch>("/api/user/saved-searches", {
        method: "POST",
        body: {
          name,
          conditionNodes: mediaQuery.conditionNodes,
          sort: mediaQuery.sort,
          widgetOverrides: mediaQuery.widgetOverrides,
        },
      });
      this.searches.push(result);
      this.activeSearchId = result.id;
      this._savedSnapshot = {
        conditionNodes: deepClone(mediaQuery.conditionNodes),
        sort: deepClone(mediaQuery.sort),
        widgetOverrides: deepClone(mediaQuery.widgetOverrides),
      };
    },

    async updateActive() {
      if (this.activeSearchId === null) return;
      const mediaQuery = useMediaQuery();
      const result = await $fetch<SavedSearch>(
        `/api/user/saved-searches/${this.activeSearchId}`,
        {
          method: "PATCH",
          body: {
            conditionNodes: mediaQuery.conditionNodes,
            sort: mediaQuery.sort,
            widgetOverrides: mediaQuery.widgetOverrides,
          },
        },
      );
      const index = this.searches.findIndex((s) => s.id === result.id);
      if (index !== -1) this.searches[index] = result;
      this._savedSnapshot = {
        conditionNodes: deepClone(mediaQuery.conditionNodes),
        sort: deepClone(mediaQuery.sort),
        widgetOverrides: deepClone(mediaQuery.widgetOverrides),
      };
    },

    async renameActive(name: string) {
      if (this.activeSearchId === null) return;
      const result = await $fetch<SavedSearch>(
        `/api/user/saved-searches/${this.activeSearchId}`,
        { method: "PATCH", body: { name } },
      );
      const index = this.searches.findIndex((s) => s.id === result.id);
      if (index !== -1) this.searches[index] = result;
    },

    async deleteActive() {
      if (this.activeSearchId === null) return;
      await $fetch(`/api/user/saved-searches/${this.activeSearchId}`, {
        method: "DELETE",
      });
      this.searches = this.searches.filter((s) => s.id !== this.activeSearchId);
      this.activeSearchId = null;
    },
  },

  persistExtended: {
    defaultStorage: "localStorage",
    keyStorage: {
      searches: "none",
      _initialized: "none",
      _savedSnapshot: "none",
      activeSearchId: "localStorage",
    },
  },
});
