import MediaFilterSidebar from "@@/app/components/MediaFilterSidebar.vue";
import type { FacetResult } from "@@/types/api-media-facets";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { keepPreviousData } from "@tanstack/vue-query";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { type Ref, nextTick, ref } from "vue";

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

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_FACETS: FacetResult = {
  id: 1,
  type: "group",
  conditions: [
    {
      id: 2,
      type: "field",
      field: "tags",
      counts: [
        { id: 10, name: "nature", count: 2, countAddedIfRemoved: null },
        { id: 11, name: "animals", count: 1, countAddedIfRemoved: null },
      ],
    },
    { id: 3, type: "field", field: "source", counts: [] },
    { id: 4, type: "field", field: "type", counts: [] },
    { id: 5, type: "field", field: "groups", counts: [] },
  ],
};

// ── useQuery mock ──────────────────────────────────────────────────────────
// vi.hoisted ensures useQuerySpy is available before module imports run,
// which is required because the mock factory is hoisted to the top of the file.

const useQuerySpy = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/vue-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/vue-query")>();
  return { ...actual, useQuery: useQuerySpy };
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("MediaFilterSidebar – loading state", () => {
  let mockData: Ref<FacetResult | undefined>;
  let mockIsFetching: Ref<boolean>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("$fetch", (url: string) => {
      if (url === "/api/user/saved-searches") return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected $fetch call: ${url}`));
    });
    mockData = ref<FacetResult | undefined>(MOCK_FACETS);
    mockIsFetching = ref(false);
    useQuerySpy.mockImplementation(() => ({
      data: mockData,
      isFetching: mockIsFetching,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("passes loading=false to schemaConfig when not fetching", async () => {
    const wrapper = await mountSuspended(MediaFilterSidebar);
    const gcInput = wrapper.findComponent({
      name: "QueryBuilderGroupConditionInput",
    });
    expect(gcInput.props("schemaConfig").loading).toBeFalsy();
  });

  it("does not show loading immediately when isFetching starts", async () => {
    const wrapper = await mountSuspended(MediaFilterSidebar);
    mockIsFetching.value = true;
    await nextTick();
    const gcInput = wrapper.findComponent({
      name: "QueryBuilderGroupConditionInput",
    });
    expect(gcInput.props("schemaConfig").loading).toBeFalsy();
  });

  it("shows loading=true after 500ms when isFetching is sustained", async () => {
    const wrapper = await mountSuspended(MediaFilterSidebar);
    mockIsFetching.value = true;
    await nextTick();
    vi.advanceTimersByTime(500);
    await nextTick();
    const gcInput = wrapper.findComponent({
      name: "QueryBuilderGroupConditionInput",
    });
    expect(gcInput.props("schemaConfig").loading).toBe(true);
  });

  it("suppresses loading if isFetching resolves before 500ms", async () => {
    const wrapper = await mountSuspended(MediaFilterSidebar);
    mockIsFetching.value = true;
    await nextTick();
    vi.advanceTimersByTime(300);
    await nextTick();
    mockIsFetching.value = false; // done before 500 ms
    await nextTick();
    vi.advanceTimersByTime(200); // remaining would-be window
    await nextTick();
    const gcInput = wrapper.findComponent({
      name: "QueryBuilderGroupConditionInput",
    });
    expect(gcInput.props("schemaConfig").loading).toBeFalsy();
  });

  it("clears loading immediately when isFetching stops (even after spinner appeared)", async () => {
    const wrapper = await mountSuspended(MediaFilterSidebar);
    mockIsFetching.value = true;
    await nextTick();
    vi.advanceTimersByTime(500);
    await nextTick();
    mockIsFetching.value = false;
    await nextTick();
    const gcInput = wrapper.findComponent({
      name: "QueryBuilderGroupConditionInput",
    });
    expect(gcInput.props("schemaConfig").loading).toBeFalsy();
  });

  it("keeps options populated in schemaConfig while isFetching is true", async () => {
    mockIsFetching.value = true;
    const wrapper = await mountSuspended(MediaFilterSidebar);
    const gcInput = wrapper.findComponent({
      name: "QueryBuilderGroupConditionInput",
    });
    const tagsOptions = (
      gcInput.props("schemaConfig").fieldOptions as Record<string, unknown[]>
    ).tags;
    expect(tagsOptions?.length).toBeGreaterThan(0);
  });

  it("calls useQuery with placeholderData: keepPreviousData", async () => {
    await mountSuspended(MediaFilterSidebar);
    expect(useQuerySpy).toHaveBeenCalledWith(
      expect.objectContaining({ placeholderData: keepPreviousData }),
    );
  });

  it("shows a loading indicator in the DOM after 500ms", async () => {
    mockIsFetching.value = true;
    const wrapper = await mountSuspended(MediaFilterSidebar);
    await nextTick();
    vi.advanceTimersByTime(500);
    await nextTick();
    expect(wrapper.find(".pi-spin").exists()).toBe(true);
  });

  it("does not show a loading indicator in the DOM before 500ms", async () => {
    mockIsFetching.value = true;
    const wrapper = await mountSuspended(MediaFilterSidebar);
    await nextTick();
    vi.advanceTimersByTime(499);
    await nextTick();
    expect(wrapper.find(".pi-spin").exists()).toBe(false);
  });
});
