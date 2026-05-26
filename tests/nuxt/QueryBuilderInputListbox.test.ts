import QueryBuilderInputListbox from "@@/app/components/query-builder/input/QueryBuilderInputListbox.vue";
import type { QueryFieldCondition } from "@@/types/query-condition";
import type { QuerySchemaConfig } from "@@/types/query-schema-config";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { afterAll, describe, expect, it, vi } from "vitest";
import { nextTick, reactive } from "vue";

// The pinia-persist-extended plugin accesses window.localStorage on mount.
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

// Mock the media-query store so tests don't need a real Pinia setup.
// setFieldConditionValue mutates the reactive fieldCondition directly so the
// component's computed properties re-evaluate and the DOM updates.
vi.mock("@@/stores/media-query", () => ({
  useMediaQuery: () => ({
    setFieldConditionValue: (
      condition: QueryFieldCondition,
      newValue: unknown,
    ) => {
      condition.value = newValue;
    },
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AVAILABLE_OPTIONS = [
  { id: 1, name: "Action", count: 10 },
  { id: 2, name: "Comedy", count: 5 },
  { id: 3, name: "Drama", count: 8 },
  { id: 4, name: "Horror", count: 0 },
] as const;

const schemaConfig: QuerySchemaConfig = {
  availableFields: [
    {
      id: "genre",
      displayName: "Genre",
      type: "multi-select",
      availableOptions: [...AVAILABLE_OPTIONS],
    },
  ],
  fieldTypes: [],
};

/** Create a reactive field condition so the component re-renders when value changes. */
function makeCondition(value: string[] = []): QueryFieldCondition {
  return reactive<QueryFieldCondition>({
    id: 1,
    type: "field",
    field: "genre",
    operator: "in",
    value,
  });
}

async function mount(value: string[] = []) {
  const fieldCondition = makeCondition(value);
  const wrapper = await mountSuspended(QueryBuilderInputListbox, {
    props: { fieldCondition, schemaConfig },
  });
  return { wrapper, fieldCondition };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("QueryBuilderInputListbox", () => {
  describe("filter bar", () => {
    it("renders with a placeholder containing the field display name", async () => {
      const { wrapper } = await mount();
      expect(wrapper.find(".filter-input").attributes("placeholder")).toBe(
        "Search Genre",
      );
    });

    it("filters Listbox options to those matching the search text", async () => {
      const { wrapper } = await mount();
      await wrapper.find(".filter-input").setValue("dr");
      await nextTick();
      const options = wrapper
        .findComponent({ name: "Listbox" })
        .props("options") as (typeof AVAILABLE_OPTIONS)[number][];
      expect(options).toHaveLength(1);
      expect(options[0].name).toBe("Drama");
    });

    it("filter matching is case-insensitive", async () => {
      const { wrapper } = await mount();
      await wrapper.find(".filter-input").setValue("ACTION");
      await nextTick();
      const options = wrapper
        .findComponent({ name: "Listbox" })
        .props("options") as (typeof AVAILABLE_OPTIONS)[number][];
      expect(options).toHaveLength(1);
      expect(options[0].name).toBe("Action");
    });

    it("shows all unselected options when filter is cleared", async () => {
      const { wrapper } = await mount();
      await wrapper.find(".filter-input").setValue("act");
      await nextTick();
      await wrapper.find(".filter-input").setValue("");
      await nextTick();
      const options = wrapper
        .findComponent({ name: "Listbox" })
        .props("options") as unknown[];
      expect(options).toHaveLength(AVAILABLE_OPTIONS.length);
    });

    it("excludes already-selected options even when they match the filter", async () => {
      const { wrapper } = await mount(["3"]);
      await wrapper.find(".filter-input").setValue("dr");
      await nextTick();
      const options = wrapper
        .findComponent({ name: "Listbox" })
        .props("options") as (typeof AVAILABLE_OPTIONS)[number][];
      expect(options).toHaveLength(0);
    });
  });

  describe("selected options section", () => {
    it("shows no selected-item entries when nothing is selected", async () => {
      const { wrapper } = await mount();
      expect(wrapper.findAll(".selected-item")).toHaveLength(0);
    });

    it("shows a selected-item entry for each selected option", async () => {
      const { wrapper } = await mount(["1", "2"]);
      const items = wrapper.findAll(".selected-item");
      expect(items).toHaveLength(2);
      expect(items[0].text()).toContain("Action");
      expect(items[1].text()).toContain("Comedy");
    });

    it("shows the option count inside the selected-item entry", async () => {
      const { wrapper } = await mount(["1"]);
      expect(wrapper.find(".selected-item .option-count").text()).toBe("10");
    });

    it("shows a section-divider only when there are selected items", async () => {
      const { wrapper: emptyWrapper } = await mount();
      expect(emptyWrapper.find(".section-divider").exists()).toBe(false);

      const { wrapper: selectedWrapper } = await mount(["1"]);
      expect(selectedWrapper.find(".section-divider").exists()).toBe(true);
    });

    it("deselects an option when clicking its selected-item entry", async () => {
      const { wrapper, fieldCondition } = await mount(["1"]);
      await wrapper.find(".selected-item").trigger("click");
      await nextTick();
      expect(wrapper.findAll(".selected-item")).toHaveLength(0);
      expect(fieldCondition.value).toEqual([]);
    });

    it("deselects only the clicked item when multiple options are selected", async () => {
      const { wrapper, fieldCondition } = await mount(["1", "2", "3"]);
      // Click the second item (Comedy)
      await wrapper.findAll(".selected-item")[1].trigger("click");
      await nextTick();
      expect(fieldCondition.value).toEqual(["1", "3"]);
      expect(wrapper.findAll(".selected-item")).toHaveLength(2);
    });
  });

  describe("unselected options list", () => {
    it("passes all options to the Listbox when nothing is selected", async () => {
      const { wrapper } = await mount();
      const options = wrapper
        .findComponent({ name: "Listbox" })
        .props("options") as unknown[];
      expect(options).toHaveLength(AVAILABLE_OPTIONS.length);
    });

    it("excludes selected options from the Listbox", async () => {
      const { wrapper } = await mount(["1"]);
      const options = wrapper
        .findComponent({ name: "Listbox" })
        .props("options") as (typeof AVAILABLE_OPTIONS)[number][];
      expect(options.map((o) => o.id)).not.toContain(1);
      expect(options).toHaveLength(AVAILABLE_OPTIONS.length - 1);
    });

    it("selects an option when the Listbox emits update:modelValue", async () => {
      const { wrapper, fieldCondition } = await mount();
      await wrapper
        .findComponent({ name: "Listbox" })
        .vm.$emit("update:modelValue", { id: 3, name: "Drama", count: 8 });
      await nextTick();
      expect(fieldCondition.value).toEqual(["3"]);
    });

    it("moves a newly selected option into the selected-item section", async () => {
      const { wrapper } = await mount();
      await wrapper
        .findComponent({ name: "Listbox" })
        .vm.$emit("update:modelValue", { id: 3, name: "Drama", count: 8 });
      await nextTick();
      const items = wrapper.findAll(".selected-item");
      expect(items).toHaveLength(1);
      expect(items[0].text()).toContain("Drama");
    });

    it("removes a newly selected option from the Listbox options", async () => {
      const { wrapper } = await mount();
      await wrapper
        .findComponent({ name: "Listbox" })
        .vm.$emit("update:modelValue", { id: 3, name: "Drama", count: 8 });
      await nextTick();
      const options = wrapper
        .findComponent({ name: "Listbox" })
        .props("options") as (typeof AVAILABLE_OPTIONS)[number][];
      expect(options.map((o) => o.id)).not.toContain(3);
    });

    it("re-adds a deselected option back into the Listbox", async () => {
      const { wrapper } = await mount(["1"]);
      await wrapper.find(".selected-item").trigger("click");
      await nextTick();
      const options = wrapper
        .findComponent({ name: "Listbox" })
        .props("options") as (typeof AVAILABLE_OPTIONS)[number][];
      expect(options.map((o) => o.id)).toContain(1);
      expect(options).toHaveLength(AVAILABLE_OPTIONS.length);
    });

    it("does not add an option twice if it is already selected", async () => {
      const { wrapper, fieldCondition } = await mount(["3"]);
      await wrapper
        .findComponent({ name: "Listbox" })
        .vm.$emit("update:modelValue", { id: 3, name: "Drama", count: 8 });
      await nextTick();
      expect(fieldCondition.value).toEqual(["3"]);
    });
  });

  describe("loading state", () => {
    it("shows a loading spinner in the filter bar when schemaConfig.loading is true", async () => {
      const wrapper = await mountSuspended(QueryBuilderInputListbox, {
        props: {
          fieldCondition: makeCondition(),
          schemaConfig: { ...schemaConfig, loading: true },
        },
      });
      expect(wrapper.find(".loading-icon.pi-spin").exists()).toBe(true);
    });

    it("does not show a loading spinner when schemaConfig.loading is false", async () => {
      const { wrapper } = await mount();
      expect(wrapper.find(".loading-icon.pi-spin").exists()).toBe(false);
    });
  });

  describe("resize handle", () => {
    // Dispatch a native MouseEvent so clientY is properly populated
    function fireMousedown(el: Element, clientY: number) {
      el.dispatchEvent(
        new MouseEvent("mousedown", {
          clientY,
          bubbles: true,
          cancelable: true,
        }),
      );
    }

    it("renders a resize handle inside the Listbox footer", async () => {
      const { wrapper } = await mount();
      expect(wrapper.find(".resize-handle").exists()).toBe(true);
    });

    it("dragging the handle down increases the list height", async () => {
      const { wrapper } = await mount();
      fireMousedown(wrapper.find(".resize-handle").element, 100);

      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 150 }));
      await nextTick();

      // listHeight = max(200 + 50, 60) = 250 → listContainerHeight = max(250 - 6, 60) = 244px
      expect(
        wrapper
          .findComponent({ name: "Listbox" })
          .element.style.getPropertyValue("--list-height"),
      ).toBe("244px");
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    it("dragging the handle up decreases the list height", async () => {
      const { wrapper } = await mount();
      fireMousedown(wrapper.find(".resize-handle").element, 100);

      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 50 }));
      await nextTick();

      // listHeight = max(200 - 50, 60) = 150 → listContainerHeight = max(150 - 6, 60) = 144px
      expect(
        wrapper
          .findComponent({ name: "Listbox" })
          .element.style.getPropertyValue("--list-height"),
      ).toBe("144px");
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    it("list height cannot be dragged below the minimum", async () => {
      const { wrapper } = await mount();
      fireMousedown(wrapper.find(".resize-handle").element, 100);

      window.dispatchEvent(new MouseEvent("mousemove", { clientY: -9999 }));
      await nextTick();

      // listHeight clamped to MIN_LIST_HEIGHT=60 → listContainerHeight = max(60 - 6, 60) = 60px
      expect(
        wrapper
          .findComponent({ name: "Listbox" })
          .element.style.getPropertyValue("--list-height"),
      ).toBe("60px");
      window.dispatchEvent(new MouseEvent("mouseup"));
    });

    it("stops resizing after mouseup", async () => {
      const { wrapper } = await mount();
      fireMousedown(wrapper.find(".resize-handle").element, 100);

      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 150 }));
      await nextTick();
      const styleAfterDrag = wrapper
        .findComponent({ name: "Listbox" })
        .element.style.getPropertyValue("--list-height");

      window.dispatchEvent(new MouseEvent("mouseup"));

      // Further movement should have no effect
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 300 }));
      await nextTick();
      expect(
        wrapper
          .findComponent({ name: "Listbox" })
          .element.style.getPropertyValue("--list-height"),
      ).toBe(styleAfterDrag);
    });
  });
});
