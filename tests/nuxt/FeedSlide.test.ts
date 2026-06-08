import { useFavourites } from "@@/stores/favourites";
import type { APIMedia } from "@@/types/api-media";
import { mountSuspended } from "@nuxt/test-utils/runtime";
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
import { nextTick, reactive } from "vue";
import type { z } from "zod";

const mockUserPreferences = reactive({
  loopVideo: false,
  muteVideo: true,
  videoFit: "cover",
});

vi.mock("@@/stores/user-preferences", () => ({
  useUserPreferences: () => mockUserPreferences,
}));

let FeedSlide: typeof import("@@/app/components/FeedSlide.vue").default;
const fetchStub = vi.fn((url: string, opts?: { method?: string }) => {
  if (
    opts?.method === "POST" &&
    typeof url === "string" &&
    url.startsWith("/api/user/favourites/")
  ) {
    const id = Number(url.split("/").at(-1));
    const favourites = useFavourites();
    return Promise.resolve({ favourited: favourites.ids.includes(id) });
  }
  return Promise.reject(new Error(`Unexpected $fetch call: ${url}`));
}) as ReturnType<typeof vi.fn> & {
  create: (options: unknown) => ReturnType<typeof vi.fn>;
};
fetchStub.create = () => fetchStub;

vi.stubGlobal("$fetch", fetchStub);

beforeAll(async () => {
  const module = await import("@@/app/components/FeedSlide.vue");
  FeedSlide = module.default;
});

// ── Storage mock (prevent pinia-persist-extended from touching real storage) ──

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

// ── Minimal media fixture ──────────────────────────────────────────────────

const MOCK_DATE = new Date("2024-01-01T00:00:00Z");

function makeMedia(id: number): z.infer<typeof APIMedia> {
  return {
    id,
    title: `Media ${id}`,
    description: null,
    duration: null,
    firstIndexedAt: MOCK_DATE,
    lastIndexedAt: MOCK_DATE,
    earliestUploadedAt: null,
    earliestCreatedAt: null,
    latestUpdatedAt: null,
    creators: [],
    uploaders: [],
    views: null,
    likes: null,
    dislikes: null,
    hasVideo: false,
    hasAudio: false,
    hasImage: true,
    fileSize: null,
    width: null,
    height: null,
    tags: [],
    sourceDetails: [],
    files: [
      {
        type: "image",
        hasVideo: false,
        hasAudio: false,
        hasImage: true,
        fileSize: null,
        width: 100,
        height: 100,
        ext: "jpg",
        filename: "test.jpg",
        sourceUrl: "https://example.com/test.jpg",
        duration: null,
        mimeType: "image/jpeg",
        urlExpires: null,
        urlUpdatedAt: MOCK_DATE,
        liaseSourceId: "source-a",
        liaseMediaId: "media-1",
      },
    ],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("FeedSlide – favourite button", () => {
  beforeEach(() => {
    fetchStub.mockClear();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("renders the favourite button", async () => {
    const wrapper = await mountSuspended(FeedSlide, {
      props: { media: makeMedia(42), isCurrent: false, isNearby: false },
    });
    expect(
      wrapper.find('[data-testid="feed-slide-favourite-btn"]').exists(),
    ).toBe(true);
  });

  it("shows 'Add to favourites' aria-label when not favourited", async () => {
    const wrapper = await mountSuspended(FeedSlide, {
      props: { media: makeMedia(42), isCurrent: false, isNearby: false },
    });
    const btn = wrapper.find('[data-testid="feed-slide-favourite-btn"]');
    expect(btn.attributes("aria-label")).toBe("Add to favourites");
  });

  it("shows 'Remove from favourites' aria-label when already favourited", async () => {
    const favourites = useFavourites();
    favourites.$patch({ ids: [42] });

    const wrapper = await mountSuspended(FeedSlide, {
      props: { media: makeMedia(42), isCurrent: false, isNearby: false },
    });
    const btn = wrapper.find('[data-testid="feed-slide-favourite-btn"]');
    expect(btn.attributes("aria-label")).toBe("Remove from favourites");
  });

  it("toggles favourite on click (add)", async () => {
    const favourites = useFavourites();
    favourites.$patch({ ids: [] });

    const wrapper = await mountSuspended(FeedSlide, {
      props: { media: makeMedia(42), isCurrent: false, isNearby: false },
    });
    await wrapper
      .find('[data-testid="feed-slide-favourite-btn"]')
      .trigger("click");
    await nextTick();

    expect(favourites.isFavourited(42)).toBe(true);
  });

  it("toggles favourite on click (remove)", async () => {
    const favourites = useFavourites();
    favourites.$patch({ ids: [42] });

    const wrapper = await mountSuspended(FeedSlide, {
      props: { media: makeMedia(42), isCurrent: false, isNearby: false },
    });
    await wrapper
      .find('[data-testid="feed-slide-favourite-btn"]')
      .trigger("click");
    await nextTick();

    expect(favourites.isFavourited(42)).toBe(false);
  });

  it("updates aria-label reactively after click", async () => {
    const favourites = useFavourites();
    favourites.$patch({ ids: [] });

    const wrapper = await mountSuspended(FeedSlide, {
      props: { media: makeMedia(42), isCurrent: false, isNearby: false },
    });
    const btn = wrapper.find('[data-testid="feed-slide-favourite-btn"]');
    expect(btn.attributes("aria-label")).toBe("Add to favourites");

    await btn.trigger("click");
    await nextTick();

    expect(btn.attributes("aria-label")).toBe("Remove from favourites");
  });
});
