import QueryBuilderInputSelectButton from "@@/app/components/query-builder/input/QueryBuilderInputSelectButton.vue";
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
vi.mock("@@/stores/media-query", () => ({
  useMediaQuery: () => ({
    widgetOverrides: {},
    setFieldConditionValue: (
      condition: QueryFieldCondition,
      newValue: unknown,
    ) => {
      condition.value = newValue;
    },
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OPTIONS = [
  { id: "yes", name: "Yes", count: 3, countAddedIfRemoved: null },
  { id: "no", name: "No", count: 7, countAddedIfRemoved: null },
];

const schemaConfig: QuerySchemaConfig = {
  fieldOptions: {
    favourited: OPTIONS,
  },
};

function makeCondition(value = ""): QueryFieldCondition {
  return reactive<QueryFieldCondition>({
    id: 1,
    type: "field",
    field: "favourited",
    operator: "equals",
    value,
  });
}

async function mount(value = "") {
  const fieldCondition = makeCondition(value);
  const wrapper = await mountSuspended(QueryBuilderInputSelectButton, {
    props: { fieldCondition, schemaConfig },
  });
  return { wrapper, fieldCondition };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("QueryBuilderInputSelectButton", () => {
  describe("option rendering", () => {
    it("renders a button for each option", async () => {
      const { wrapper } = await mount();
      const names = wrapper.findAll(".option-name").map((el) => el.text());
      expect(names).toEqual(["Yes", "No"]);
    });

    it("shows count next to each option name when count is provided", async () => {
      const { wrapper } = await mount();
      const counts = wrapper.findAll(".option-count").map((el) => el.text());
      expect(counts).toEqual(["3", "7"]);
    });

    it("does not render a count element when count is null", async () => {
      const config: QuerySchemaConfig = {
        fieldOptions: {
          favourited: [
            { id: "yes", name: "Yes", count: null, countAddedIfRemoved: null },
            { id: "no", name: "No", count: null, countAddedIfRemoved: null },
          ],
        },
      };
      const fieldCondition = makeCondition();
      const wrapper = await mountSuspended(QueryBuilderInputSelectButton, {
        props: { fieldCondition, schemaConfig: config },
      });
      expect(wrapper.findAll(".option-count")).toHaveLength(0);
    });
  });

  describe("count display for selected option", () => {
    it("shows +countAddedIfRemoved instead of count when selected option has countAddedIfRemoved set", async () => {
      const config: QuerySchemaConfig = {
        fieldOptions: {
          favourited: [
            { id: "yes", name: "Yes", count: 3, countAddedIfRemoved: 7 },
            { id: "no", name: "No", count: 7, countAddedIfRemoved: null },
          ],
        },
      };
      const fieldCondition = makeCondition("yes");
      const wrapper = await mountSuspended(QueryBuilderInputSelectButton, {
        props: { fieldCondition, schemaConfig: config },
      });
      const countEls = wrapper.findAll(".option-count");
      // Selected "yes" option should show "+7" (countAddedIfRemoved)
      expect(countEls[0]?.text()).toBe("+7");
      // Unselected "no" option should show its normal count "7"
      expect(countEls[1]?.text()).toBe("7");
    });

    it("shows the normal count for the selected option when countAddedIfRemoved is null", async () => {
      const config: QuerySchemaConfig = {
        fieldOptions: {
          favourited: [
            { id: "yes", name: "Yes", count: 3, countAddedIfRemoved: null },
            { id: "no", name: "No", count: 7, countAddedIfRemoved: null },
          ],
        },
      };
      const fieldCondition = makeCondition("yes");
      const wrapper = await mountSuspended(QueryBuilderInputSelectButton, {
        props: { fieldCondition, schemaConfig: config },
      });
      const countEls = wrapper.findAll(".option-count");
      // Selected "yes" option should still show its count "3" because countAddedIfRemoved is null
      expect(countEls[0]?.text()).toBe("3");
      expect(countEls[1]?.text()).toBe("7");
    });
  });

  describe("value toggling", () => {
    it("clicking an unselected button selects it", async () => {
      const { wrapper, fieldCondition } = await mount();
      const selectButton = wrapper.findComponent({ name: "SelectButton" });
      // Simulate selecting "yes"
      await selectButton.vm.$emit("update:modelValue", OPTIONS[0]);
      await nextTick();
      expect(fieldCondition.value).toBe("yes");
    });

    it("clicking the already-selected button deselects it (clears to empty string)", async () => {
      const { wrapper, fieldCondition } = await mount("yes");
      const selectButton = wrapper.findComponent({ name: "SelectButton" });
      // Simulate clicking the already-selected "yes" option
      await selectButton.vm.$emit("update:modelValue", OPTIONS[0]);
      await nextTick();
      expect(fieldCondition.value).toBe("");
    });
  });

  describe("clear button", () => {
    it("does not show a clear button when no value is selected", async () => {
      const { wrapper } = await mount();
      expect(wrapper.find(".clear-btn").exists()).toBe(false);
    });

    it("shows a clear button when a value is selected", async () => {
      const { wrapper } = await mount("yes");
      expect(wrapper.find(".clear-btn").exists()).toBe(true);
    });

    it("clicking the clear button clears the selected value", async () => {
      const { wrapper, fieldCondition } = await mount("yes");
      await wrapper.find(".clear-btn").trigger("click");
      await nextTick();
      expect(fieldCondition.value).toBe("");
    });

    it("clear button disappears after clearing", async () => {
      const { wrapper, fieldCondition } = await mount("yes");
      await wrapper.find(".clear-btn").trigger("click");
      await nextTick();
      expect(fieldCondition.value).toBe("");
      expect(wrapper.find(".clear-btn").exists()).toBe(false);
    });
  });
});
