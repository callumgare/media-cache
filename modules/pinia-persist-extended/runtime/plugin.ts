import type { PiniaPluginContext, StateTree } from "pinia";
import { piniaPluginPersistedstate, reactive } from "#imports";
import { ADD_LOADING_PROPERTY } from "#pinia-persist-extended-options";

// Internal shape of Pinia that exposes plugin and store registries.
// These properties are not in Pinia's public types; we access them via a
// typed interface rather than `any` to keep the rest of the code type-safe.
interface PiniaInternal {
  _p: unknown[];
  _s: Map<string, { $hydrate?: () => void }>;
  use: (plugin: (context: PiniaPluginContext) => unknown) => void;
}

// ---------------------------------------------------------------------------
// TypeScript augmentation — teaches Pinia about `persistExtended`
// ---------------------------------------------------------------------------
declare module "pinia" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface DefineStoreOptionsBase<S extends StateTree, Store> {
    persistExtended?:
      | {
          keyStorage: Record<keyof S & string, StorageType>;
          defaultStorage?: undefined;
          afterLoaded?: (
            store: Record<string, unknown>,
            loadedKeys: string[],
          ) => void;
        }
      | {
          keyStorage?: Partial<Record<keyof S & string, StorageType>>;
          defaultStorage: StorageType;
          afterLoaded?: (
            store: Record<string, unknown>,
            loadedKeys: string[],
          ) => void;
        };
  }
}

// ---------------------------------------------------------------------------
// Deferred storage
//
// localStorage and sessionStorage reads/writes are suppressed until after the
// root <Suspense> resolves (see the plugin hook below). This prevents SSR
// hydration mismatches: client-only values differ from server-rendered
// defaults, so we keep them invisible until Vue has finished hydrating all
// async components, then re-hydrate with the real values.
//
// _suppressWrite is set during $hydrate() to stop $subscribe callbacks from
// writing stale state back to localStorage before its own getItem has run.
// ---------------------------------------------------------------------------
let _isAfterMount = false;
let _suppressWrite = false;

/** @internal — used by tests to control deferred-storage state */
export const _setIsAfterMount = (val: boolean) => {
  _isAfterMount = val;
};

function deferredLocalStorage() {
  return {
    getItem: (key: string): string | null => {
      if (!import.meta.client || !_isAfterMount) return null;
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key: string, value: string): void => {
      if (import.meta.client && _isAfterMount && !_suppressWrite) {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          // Ignore write failures (e.g. in test environments without real storage).
        }
      }
    },
  };
}

function deferredSessionStorage() {
  return {
    getItem: (key: string): string | null => {
      if (!import.meta.client || !_isAfterMount) return null;
      try {
        return window.sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key: string, value: string): void => {
      if (import.meta.client && _isAfterMount && !_suppressWrite) {
        try {
          window.sessionStorage.setItem(key, value);
        } catch {
          // Ignore write failures (e.g. in test environments without real storage).
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export type StorageType =
  | "localStorage"
  | "sessionStorage"
  | "cookies"
  | "none";

/**
 * Returns an initial loading map for use in a store's state().
 * Keys mapped to "none" start false (never loaded); all others start true.
 * Call this as a function inside state() so each store instance gets its own
 * object (important for SSR where many instances may exist concurrently).
 */
export function loadingFor(
  keyStorage: Record<string, StorageType>,
): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(keyStorage).map(([key, storage]) => [
      key,
      storage !== "none",
    ]),
  );
}

// ---------------------------------------------------------------------------
// Pinia plugin — handles `persistExtended` on any store that declares it
// ---------------------------------------------------------------------------
type StorageLike = {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
};

function hydrateFromStorage(
  store: PiniaPluginContext["store"],
  storage: StorageLike,
  keys: string[],
  storeId: string,
  onAfterHydrate: (() => void) | undefined,
  runHooks: boolean,
) {
  const raw = storage.getItem(storeId);
  if (raw) {
    const data = JSON.parse(raw);
    const picked = Object.fromEntries(
      keys.map((k) => [k, data[k]]).filter(([, v]) => v !== undefined),
    );
    store.$patch(picked);
  }
  if (runHooks) onAfterHydrate?.();
}

function persistToStorage(
  state: StateTree,
  storage: StorageLike,
  keys: string[],
  storeId: string,
) {
  const picked = Object.fromEntries(keys.map((k) => [k, state[k]]));
  storage.setItem(storeId, JSON.stringify(picked));
}

function piniaPersistExtendedPlugin(context: PiniaPluginContext) {
  const { store, options } = context;
  const config = options.persistExtended;
  if (!config) return;

  const { keyStorage = {}, defaultStorage, afterLoaded } = config;

  // Returns the state keys that map to the given storage type.
  // Includes keys explicitly listed in keyStorage AND state keys that
  // are not in keyStorage but inherit defaultStorage.
  function keysFor(storage: StorageType): string[] {
    const explicit = Object.entries(keyStorage)
      .filter(([, v]) => v === storage)
      .map(([k]) => k);
    const inherited =
      defaultStorage === storage
        ? Object.keys(store.$state).filter((k) => !(k in keyStorage))
        : [];
    return [...explicit, ...inherited];
  }

  const cookieKeys = keysFor("cookies");
  const sessionKeys = keysFor("sessionStorage");
  const localKeys = keysFor("localStorage");

  const persistences: Array<{
    storage: StorageLike;
    keys: string[];
    onAfterHydrate?: () => void;
    deferred: boolean;
  }> = [];

  if (cookieKeys.length) {
    persistences.push({
      storage: piniaPluginPersistedstate.cookies(),
      keys: cookieKeys,
      onAfterHydrate: () => afterLoaded?.(store, cookieKeys),
      deferred: false,
    });
  }
  if (sessionKeys.length) {
    persistences.push({
      storage: deferredSessionStorage(),
      keys: sessionKeys,
      onAfterHydrate: () => {
        if (!_isAfterMount) return;
        afterLoaded?.(store, sessionKeys);
      },
      deferred: true,
    });
  }
  if (localKeys.length) {
    persistences.push({
      storage: deferredLocalStorage(),
      keys: localKeys,
      onAfterHydrate: () => {
        if (!_isAfterMount) return;
        afterLoaded?.(store, localKeys);
      },
      deferred: true,
    });
  }

  // When ADD_LOADING_PROPERTY is true (set globally in nuxt.config), build a
  // reactive loading map and wire it into each persistence's afterHydrate so
  // flags clear automatically.
  let loading: Record<string, boolean> | undefined;
  if (ADD_LOADING_PROPERTY) {
    const allKeys = Object.keys(store.$state);
    const loadingMap: Record<string, boolean> = {};
    for (const key of allKeys) {
      const effective = ((
        keyStorage as Record<string, StorageType | undefined>
      )[key] ??
        defaultStorage ??
        "none") as StorageType;
      loadingMap[key] = effective !== "none";
    }
    loading = reactive(loadingMap);

    for (const p of persistences) {
      const original = p.onAfterHydrate;
      p.onAfterHydrate = () => {
        if (p.deferred && !_isAfterMount) return;
        for (const key of p.keys) {
          if (loading !== undefined) loading[key] = false;
        }
        original?.();
      };
    }
  }

  store.$hydrate = ({ runHooks = true } = {}) => {
    _suppressWrite = true;
    for (const p of persistences)
      hydrateFromStorage(
        store,
        p.storage,
        p.keys,
        store.$id,
        p.onAfterHydrate,
        runHooks,
      );
    _suppressWrite = false;
  };
  store.$persist = () => {
    for (const p of persistences)
      persistToStorage(store.$state, p.storage, p.keys, store.$id);
  };

  for (const p of persistences) {
    hydrateFromStorage(
      store,
      p.storage,
      p.keys,
      store.$id,
      p.onAfterHydrate,
      true,
    );
    store.$subscribe(
      (_mutation, state) =>
        persistToStorage(state, p.storage, p.keys, store.$id),
      {
        detached: true,
      },
    );
  }

  if (ADD_LOADING_PROPERTY) return { loading };
}

// ---------------------------------------------------------------------------
// Nuxt plugin
//
// Registers the Pinia plugin above and unlocks deferred storages after the
// root <Suspense> resolves — i.e. after ALL async layouts and page components
// have been hydrated against the server HTML.
//
// app:mounted fires too early: async components inside <Suspense> are not yet
// hydrated at that point, so patching state there causes Vue hydration
// mismatch warnings. app:suspense:resolve fires after everything is done.
//
// Iterates pinia._s (all active stores) so any store using persistExtended
// is automatically re-hydrated without being named here.
//
// Guards against double-registration in case the module is both auto-discovered
// from modules/ and explicitly listed in nuxt.config modules[].
// ---------------------------------------------------------------------------
export default defineNuxtPlugin({
  name: "pinia-persist-extended",
  setup(nuxtApp) {
    const pinia = nuxtApp.$pinia as unknown as PiniaInternal;
    if (!(pinia._p as unknown[]).includes(piniaPersistExtendedPlugin)) {
      pinia.use(piniaPersistExtendedPlugin);
    }
  },
  hooks: {
    "app:suspense:resolve"() {
      if (!import.meta.client || _isAfterMount) return;
      _isAfterMount = true;
      _suppressWrite = true;
      const pinia = useNuxtApp().$pinia as unknown as PiniaInternal;
      for (const store of pinia?._s?.values() ?? []) {
        store.$hydrate?.();
      }
      _suppressWrite = false;
    },
  },
});
