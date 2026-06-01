import { defineStore } from "pinia";

export const useFavourites = defineStore("favourites", {
  state: () => ({
    ids: [] as number[],
    _initialized: false,
  }),
  getters: {
    isFavourited: (state) => (id: number) => state.ids.includes(id),
  },
  actions: {
    async init() {
      if (this._initialized) return;
      this._initialized = true;
      const ids = await $fetch<number[]>("/api/user/favourites");
      this.ids = ids;
    },

    async toggle(id: number) {
      // Optimistic update
      const wasFavourited = this.ids.includes(id);
      if (wasFavourited) {
        this.ids = this.ids.filter((i) => i !== id);
      } else {
        this.ids = [...this.ids, id];
      }
      try {
        const result = await $fetch<{ favourited: boolean }>(
          `/api/user/favourites/${id}`,
          { method: "POST" },
        );
        // Sync with server response
        const isLocallyFavourited = this.ids.includes(id);
        if (result.favourited && !isLocallyFavourited) {
          this.ids = [...this.ids, id];
        } else if (!result.favourited && isLocallyFavourited) {
          this.ids = this.ids.filter((i) => i !== id);
        }
      } catch {
        // Rollback on error
        if (wasFavourited) {
          this.ids = [...this.ids, id];
        } else {
          this.ids = this.ids.filter((i) => i !== id);
        }
      }
    },
  },
});
