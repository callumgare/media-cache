/**
 * Tests for modules/pinia-persist-extended
 *
 * Sections:
 *  1. loadingFor — pure utility function
 *  2. Pre-mount deferred behavior — tests that MUST run before any
 *     mountSuspended call so that _isAfterMount is still false. Each Nuxt
 *     test file gets a fresh isolated environment, so this is guaranteed when
 *     the pre-mount describe block contains no mountSuspended calls.
 *  3. Post-mount — tests that run after app:suspense:resolve has fired.
 *     A single mountSuspended in beforeAll flips _isAfterMount to true for
 *     the remainder of the file.
 *
 * Regression scenarios covered:
 *  - "Reset on reload": _suppressWrite prevents $subscribe from writing stale
 *    pre-hydration defaults to storage while $hydrate() is iterating backends.
 *  - "app:mounted too early": app:suspense:resolve (not app:mounted) is used
 *    so that async components inside <Suspense> have fully hydrated before
 *    deferred storage is unlocked.
 *
 * Each test creates stores with a unique ID (via nextId()) to prevent state
 * leakage between tests.
 *
 * Storage setup
 * ─────────────
 * The @nuxt/test-utils/runtime environment provides a limited localStorage
 * stub that lacks standard Web Storage methods. We replace both storages with
 * Map-backed in-memory implementations via vi.stubGlobal so that both the test
 * code and the plugin's window.localStorage / window.sessionStorage calls
 * share the same backing store.
 * Test code reads and writes the underlying Maps directly (_local / _session)
 * rather than calling localStorage.setItem() etc., which sidesteps any
 * remaining type differences between the global and window properties.
 */
import {
  _setIsAfterMount,
  loadingFor,
} from "@@/modules/pinia-persist-extended/runtime/plugin";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { defineStore } from "pinia";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { defineComponent, nextTick } from "vue";

// ── In-memory storage mocks ───────────────────────────────────────────────────
// Keep the Map objects at module scope so test code can read/write them
// directly without going through the localStorage API.

const _local = new Map<string, string>();
const _session = new Map<string, string>();

function makeStorageMock(store: Map<string, string>): Storage {
  return {
    get length() {
      return store.size;
    },
    key: (n: number) => [...store.keys()][n] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
}

// Set up in-memory storage mocks.
//
// The @nuxt/test-utils environment provides a Happy DOM window whose
// localStorage stub lacks standard methods. We need to replace BOTH:
//   • global.localStorage  — used by test code (via `localStorage.setItem` etc.)
//   • window.localStorage  — used by the plugin (via `window.localStorage.getItem`)
//
// In Happy DOM, window !== global, so vi.stubGlobal alone does not affect
// window.localStorage. Object.defineProperty on window covers the plugin side.
// Both mocks wrap the same underlying Map so reads/writes are always in sync.
const localStorageMock = makeStorageMock(_local);
const sessionStorageMock = makeStorageMock(_session);

vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("sessionStorage", sessionStorageMock);

// Also patch window directly for the plugin's window.localStorage calls.
if (typeof window !== "undefined") {
  try {
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "sessionStorage", {
      value: sessionStorageMock,
      configurable: true,
      writable: true,
    });
  } catch {
    // Non-configurable in this environment; plugin storage tests may fail.
  }
}

afterAll(() => vi.unstubAllGlobals());

// ── Helpers ───────────────────────────────────────────────────────────────────

// Minimal component whose mounting triggers app:suspense:resolve.
const Stub = defineComponent({ template: "<div />" });

let _storeCounter = 0;
const nextId = () => `__test-ppe-${_storeCounter++}`;

// Convenience wrappers so test assertions never call localStorage.getItem()
// (which might fail in some environments).
const localGet = (id: string) => {
  const raw = _local.get(id);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
};
const sessionGet = (id: string) => {
  const raw = _session.get(id);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
};

// ---------------------------------------------------------------------------
// 1. loadingFor utility
// ---------------------------------------------------------------------------

describe("loadingFor", () => {
  it('maps "localStorage" to true', () => {
    expect(loadingFor({ key: "localStorage" })).toEqual({ key: true });
  });

  it('maps "sessionStorage" to true', () => {
    expect(loadingFor({ key: "sessionStorage" })).toEqual({ key: true });
  });

  it('maps "cookies" to true', () => {
    expect(loadingFor({ key: "cookies" })).toEqual({ key: true });
  });

  it('maps "none" to false', () => {
    expect(loadingFor({ key: "none" })).toEqual({ key: false });
  });

  it("handles mixed storage types in one call", () => {
    expect(
      loadingFor({
        a: "localStorage",
        b: "none",
        c: "cookies",
        d: "sessionStorage",
      }),
    ).toEqual({ a: true, b: false, c: true, d: true });
  });

  it("returns a new object on each call (not a shared reference)", () => {
    const ks = { a: "localStorage" as const };
    expect(loadingFor(ks)).not.toBe(loadingFor(ks));
  });
});

// ---------------------------------------------------------------------------
// 2. Pre-mount deferred behavior
//
// These tests rely on _isAfterMount being false, which is only guaranteed when
// they run before any mountSuspended call in this file. Each Nuxt test file
// receives a fresh isolated environment, so this holds at file start.
// ---------------------------------------------------------------------------

describe("deferred storage — before app:suspense:resolve", () => {
  // Explicitly set _isAfterMount = false for each test so pre-mount behavior
  // is verified even if the Nuxt test environment fires app:suspense:resolve
  // during its own setup (which would otherwise flip the flag to true).
  beforeEach(() => {
    _setIsAfterMount(false);
    _local.clear();
    _session.clear();
  });
  afterEach(() => {
    _setIsAfterMount(true);
  });

  it("localStorage data is NOT applied to the store before mounting", () => {
    const id = nextId();
    _local.set(id, JSON.stringify({ val: "stored-value" }));

    const store = defineStore(id, {
      state: () => ({ val: "default" }),
      persistExtended: { keyStorage: { val: "localStorage" } },
    })();

    // Deferred: deferredLocalStorage.getItem returns null before _isAfterMount.
    expect(store.val).toBe("default");
  });

  it("sessionStorage data is NOT applied to the store before mounting", () => {
    const id = nextId();
    _session.set(id, JSON.stringify({ val: "session-value" }));

    const store = defineStore(id, {
      state: () => ({ val: "default" }),
      persistExtended: { keyStorage: { val: "sessionStorage" } },
    })();

    expect(store.val).toBe("default");
  });

  it("localStorage writes are suppressed before mounting (state change is not persisted)", () => {
    const id = nextId();

    const store = defineStore(id, {
      state: () => ({ val: "default" }),
      persistExtended: { keyStorage: { val: "localStorage" } },
    })();

    store.val = "changed";

    // deferredLocalStorage.setItem is a no-op when _isAfterMount is false.
    expect(_local.has(id)).toBe(false);
  });

  it("loading is true for localStorage keys before mount", () => {
    const id = nextId();
    const store = defineStore(id, {
      state: () => ({ val: "default" }),
      persistExtended: { keyStorage: { val: "localStorage" } },
    })();

    // onAfterHydrate guards on !_isAfterMount → loading stays true
    expect(store.loading?.val).toBe(true);
  });

  it("loading is true for sessionStorage keys before mount", () => {
    const id = nextId();
    const store = defineStore(id, {
      state: () => ({ val: "default" }),
      persistExtended: { keyStorage: { val: "sessionStorage" } },
    })();

    expect(store.loading?.val).toBe(true);
  });

  it("loading is false for 'none' keys even before mount (no async wait needed)", () => {
    const id = nextId();
    const store = defineStore(id, {
      state: () => ({ persisted: "a", transient: "b" }),
      persistExtended: {
        keyStorage: { persisted: "localStorage", transient: "none" },
      },
    })();

    expect(store.loading?.transient).toBe(false);
    expect(store.loading?.persisted).toBe(true);
  });

  it("afterLoaded is NOT called for deferred storages before mount", () => {
    const id = nextId();
    const afterLoaded = vi.fn();

    defineStore(id, {
      state: () => ({ val: "default" }),
      persistExtended: { keyStorage: { val: "localStorage" }, afterLoaded },
    })();

    expect(afterLoaded).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Post-mount tests
//
// A single mountSuspended in beforeAll triggers app:suspense:resolve once,
// setting _isAfterMount = true for all remaining tests in the file.
// Stores created after this point read/write localStorage immediately.
// ---------------------------------------------------------------------------

describe("after app:suspense:resolve", () => {
  beforeAll(async () => {
    await mountSuspended(Stub);
  });

  beforeEach(() => {
    _local.clear();
    _session.clear();
  });

  // ── localStorage ───────────────────────────────────────────────────────────

  describe("localStorage", () => {
    it("reads a pre-existing value from localStorage on store creation", () => {
      const id = nextId();
      _local.set(id, JSON.stringify({ val: "persisted" }));

      const store = defineStore(id, {
        state: () => ({ val: "default" }),
        persistExtended: { keyStorage: { val: "localStorage" } },
      })();

      expect(store.val).toBe("persisted");
    });

    it("writes state changes to localStorage", async () => {
      const id = nextId();
      const store = defineStore(id, {
        state: () => ({ val: "initial" }),
        persistExtended: { keyStorage: { val: "localStorage" } },
      })();

      store.val = "updated";
      await nextTick();
      expect(localGet(id)).toMatchObject({ val: "updated" });
    });

    it("does not persist keys mapped to 'none'", async () => {
      const id = nextId();
      const store = defineStore(id, {
        state: () => ({ saved: "a", transient: "b" }),
        persistExtended: {
          keyStorage: { saved: "localStorage", transient: "none" },
        },
      })();

      store.saved = "x";
      store.transient = "y";
      await nextTick();
      const stored = localGet(id);
      expect(stored).toHaveProperty("saved", "x");
      expect(stored).not.toHaveProperty("transient");
    });

    it("only applies keys present in stored JSON; absent keys keep their defaults", () => {
      const id = nextId();
      _local.set(id, JSON.stringify({ a: "stored-a" })); // b is absent

      const store = defineStore(id, {
        state: () => ({ a: "default-a", b: "default-b" }),
        persistExtended: {
          keyStorage: { a: "localStorage", b: "localStorage" },
        },
      })();

      expect(store.a).toBe("stored-a");
      expect(store.b).toBe("default-b");
    });
  });

  // ── sessionStorage ─────────────────────────────────────────────────────────

  describe("sessionStorage", () => {
    it("reads a pre-existing value from sessionStorage on store creation", () => {
      const id = nextId();
      _session.set(id, JSON.stringify({ val: "session-val" }));

      expect(
        defineStore(id, {
          state: () => ({ val: "default" }),
          persistExtended: { keyStorage: { val: "sessionStorage" } },
        })().val,
      ).toBe("session-val");
    });

    it("writes state changes to sessionStorage", async () => {
      const id = nextId();
      const store = defineStore(id, {
        state: () => ({ val: "initial" }),
        persistExtended: { keyStorage: { val: "sessionStorage" } },
      })();

      store.val = "updated";
      await nextTick();
      expect(sessionGet(id)).toMatchObject({ val: "updated" });
    });
  });

  // ── defaultStorage inheritance ─────────────────────────────────────────────

  describe("defaultStorage inheritance", () => {
    it("keys absent from keyStorage inherit defaultStorage for reading", () => {
      const id = nextId();
      _local.set(id, JSON.stringify({ inherited: "from-local" }));

      const store = defineStore(id, {
        state: () => ({ explicit: "default", inherited: "default" }),
        persistExtended: {
          keyStorage: { explicit: "none" },
          defaultStorage: "localStorage",
        },
      })();

      expect(store.inherited).toBe("from-local");
      expect(store.explicit).toBe("default"); // 'none' → never read
    });

    it("writes inherited keys to defaultStorage on state change", async () => {
      const id = nextId();
      const store = defineStore(id, {
        state: () => ({ val: "default" }),
        persistExtended: { keyStorage: {}, defaultStorage: "localStorage" },
      })();

      store.val = "new-value";
      await nextTick();
      expect(localGet(id)).toMatchObject({ val: "new-value" });
    });

    it("explicit keyStorage entries override defaultStorage", () => {
      const id = nextId();
      _session.set(id, JSON.stringify({ overridden: "from-session" }));

      const store = defineStore(id, {
        state: () => ({ overridden: "default", other: "default" }),
        persistExtended: {
          keyStorage: { overridden: "sessionStorage" },
          defaultStorage: "localStorage",
        },
      })();

      expect(store.overridden).toBe("from-session");
    });

    it("'none' in keyStorage prevents persistence even when defaultStorage is set", async () => {
      const id = nextId();
      const store = defineStore(id, {
        state: () => ({ excluded: "initial", normal: "initial" }),
        persistExtended: {
          keyStorage: { excluded: "none" },
          defaultStorage: "localStorage",
        },
      })();

      store.excluded = "changed";
      store.normal = "changed";
      await nextTick();
      const stored = localGet(id);
      expect(stored).toHaveProperty("normal", "changed");
      expect(stored).not.toHaveProperty("excluded");
    });
  });

  // ── loading flags ──────────────────────────────────────────────────────────

  describe("loading flags (addLoadingProperty global option)", () => {
    it("loading is false for all keys immediately after store creation (post-mount)", () => {
      // _isAfterMount = true → onAfterHydrate fires during initial plugin setup
      const id = nextId();
      const store = defineStore(id, {
        state: () => ({ a: "default", b: "default" }),
        persistExtended: {
          keyStorage: { a: "localStorage", b: "sessionStorage" },
        },
      })();

      expect(store.loading?.a).toBe(false);
      expect(store.loading?.b).toBe(false);
    });

    it("loading is false for 'none' keys", () => {
      const id = nextId();
      const store = defineStore(id, {
        state: () => ({ persisted: "a", transient: "b" }),
        persistExtended: {
          keyStorage: { persisted: "localStorage", transient: "none" },
        },
      })();

      expect(store.loading?.transient).toBe(false);
    });

    it("loading map covers all state keys including those inherited via defaultStorage", () => {
      const id = nextId();
      const store = defineStore(id, {
        state: () => ({ x: 1, y: 2, z: 3 }),
        persistExtended: {
          keyStorage: { x: "localStorage" },
          defaultStorage: "sessionStorage",
        },
      })();

      expect(store.loading).toHaveProperty("x");
      expect(store.loading).toHaveProperty("y"); // inherited
      expect(store.loading).toHaveProperty("z"); // inherited
    });

    it("stores WITHOUT persistExtended do not have a loading property", () => {
      const id = nextId();
      const store = defineStore(id, { state: () => ({ val: "x" }) })();
      expect(store.loading).toBeUndefined();
    });
  });

  // ── afterLoaded callback ───────────────────────────────────────────────────

  describe("afterLoaded callback", () => {
    it("is called after localStorage hydration with the store and the localStorage keys", () => {
      const id = nextId();
      _local.set(id, JSON.stringify({ a: "stored-a" }));
      const afterLoaded = vi.fn();

      const store = defineStore(id, {
        state: () => ({ a: "default" }),
        persistExtended: { keyStorage: { a: "localStorage" }, afterLoaded },
      })();

      expect(afterLoaded).toHaveBeenCalledOnce();
      const call = afterLoaded.mock.calls[0];
      const [storeArg, keysArg] = call ?? [];
      expect(keysArg).toContain("a");
      expect(storeArg?.a).toBe("stored-a");
    });

    it("is called even when storage is empty (signals hydration attempt completed)", () => {
      const id = nextId();
      const afterLoaded = vi.fn();

      defineStore(id, {
        state: () => ({ a: "default" }),
        persistExtended: { keyStorage: { a: "localStorage" }, afterLoaded },
      })();

      expect(afterLoaded).toHaveBeenCalledOnce();
    });

    it("is called separately per storage group with the keys for that group", () => {
      const id = nextId();
      const afterLoaded = vi.fn();

      defineStore(id, {
        state: () => ({ a: "default", b: "default" }),
        persistExtended: {
          keyStorage: { a: "localStorage", b: "sessionStorage" },
          afterLoaded,
        },
      })();

      expect(afterLoaded).toHaveBeenCalledTimes(2);
      const keyGroups = afterLoaded.mock.calls.map(([, keys]) => keys);
      expect(keyGroups).toContainEqual(["a"]);
      expect(keyGroups).toContainEqual(["b"]);
    });
  });

  // ── $hydrate() ────────────────────────────────────────────────────────────

  describe("$hydrate()", () => {
    it("re-reads localStorage and updates store state", () => {
      const id = nextId();
      const store = defineStore(id, {
        state: () => ({ val: "default" }),
        persistExtended: { keyStorage: { val: "localStorage" } },
      })();

      expect(store.val).toBe("default");
      _local.set(id, JSON.stringify({ val: "hydrated" }));
      store.$hydrate();
      expect(store.val).toBe("hydrated");
    });

    it("re-reads sessionStorage and updates store state", () => {
      const id = nextId();
      const store = defineStore(id, {
        state: () => ({ val: "default" }),
        persistExtended: { keyStorage: { val: "sessionStorage" } },
      })();

      _session.set(id, JSON.stringify({ val: "session-hydrated" }));
      store.$hydrate();
      expect(store.val).toBe("session-hydrated");
    });

    it("calls afterLoaded when runHooks is true (default)", () => {
      const id = nextId();
      const afterLoaded = vi.fn();
      const store = defineStore(id, {
        state: () => ({ val: "default" }),
        persistExtended: { keyStorage: { val: "localStorage" }, afterLoaded },
      })();

      afterLoaded.mockClear();
      store.$hydrate();
      expect(afterLoaded).toHaveBeenCalled();
    });

    it("skips afterLoaded when runHooks is false", () => {
      const id = nextId();
      const afterLoaded = vi.fn();
      const store = defineStore(id, {
        state: () => ({ val: "default" }),
        persistExtended: { keyStorage: { val: "localStorage" }, afterLoaded },
      })();

      afterLoaded.mockClear();
      store.$hydrate({ runHooks: false });
      expect(afterLoaded).not.toHaveBeenCalled();
    });

    it("leaves storage unchanged after hydrating (no spurious writes)", () => {
      const id = nextId();
      const store = defineStore(id, {
        state: () => ({ val: "default" }),
        persistExtended: { keyStorage: { val: "localStorage" } },
      })();

      _local.set(id, JSON.stringify({ val: "from-storage" }));
      store.$hydrate();

      // The final stored value must be the one we put there, not something
      // written back by $subscribe during hydration.
      expect(localGet(id)).toMatchObject({ val: "from-storage" });
    });
  });

  // ── $persist() ────────────────────────────────────────────────────────────

  describe("$persist()", () => {
    it("writes current state to localStorage", () => {
      const id = nextId();
      const store = defineStore(id, {
        state: () => ({ val: "initial", extra: "x" }),
        persistExtended: { keyStorage: { val: "localStorage", extra: "none" } },
      })();

      _local.clear(); // remove what $subscribe may have written
      store.$persist();
      const stored = localGet(id);
      expect(stored).toHaveProperty("val", "initial");
      expect(stored).not.toHaveProperty("extra"); // 'none' keys excluded
    });

    it("writes current state to sessionStorage", () => {
      const id = nextId();
      const store = defineStore(id, {
        state: () => ({ val: "initial" }),
        persistExtended: { keyStorage: { val: "sessionStorage" } },
      })();

      store.val = "changed";
      _session.clear();
      store.$persist();
      expect(sessionGet(id)).toMatchObject({ val: "changed" });
    });
  });

  // ── Regression: _suppressWrite ────────────────────────────────────────────

  describe("regression: _suppressWrite prevents stale writes during $hydrate()", () => {
    /**
     * The bug: when a store has multiple storage backends (e.g. sessionStorage
     * + localStorage), calling $hydrate() iterates them in order. Each
     * hydrateFromStorage call does a $patch(), which synchronously fires ALL
     * $subscribe callbacks. Without _suppressWrite, the first backend's $patch
     * would cause the second backend's $subscribe to write the pre-hydration
     * default for the second backend — overwriting its stored value before
     * hydrateFromStorage for the second backend has had a chance to read it.
     *
     * Without the fix:
     *  1. $hydrate() starts iterating: session first, then local
     *  2. Hydrate session → $patch({ a: 'correct-a' })
     *     → $subscribe for localStorage fires with state { a:'correct-a', b:'default-b' }
     *     → localStorage[id] is overwritten with { b: 'default-b' }          ← BUG
     *  3. Hydrate local → reads { b: 'default-b' } (stale!) → store.b = 'default-b'
     *
     * With _suppressWrite = true wrapping $hydrate(), step 2's write is blocked.
     */
    it("does not overwrite localStorage with pre-hydration defaults when sessionStorage is hydrated first", () => {
      const id = nextId();

      const store = defineStore(id, {
        state: () => ({ a: "default-a", b: "default-b" }),
        persistExtended: {
          keyStorage: { a: "sessionStorage", b: "localStorage" },
        },
      })();

      // Set both storages to non-default values, then re-hydrate.
      _session.set(id, JSON.stringify({ a: "correct-a" }));
      _local.set(id, JSON.stringify({ b: "correct-b" }));
      store.$hydrate();

      expect(store.a).toBe("correct-a");
      expect(store.b).toBe("correct-b");
      // localStorage must not have been overwritten with 'default-b'
      expect(localGet(id)).toMatchObject({ b: "correct-b" });
    });
  });

  // ── stores without persistExtended are unaffected ─────────────────────────

  describe("stores without persistExtended", () => {
    it("a plain store is not modified by the plugin", () => {
      const id = nextId();
      _local.set(id, JSON.stringify({ val: "should-be-ignored" }));

      const store = defineStore(id, { state: () => ({ val: "default" }) })();

      expect(store.val).toBe("default");
      expect(store.loading).toBeUndefined();
    });
  });
});
