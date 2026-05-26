import QueryBuilderConditionTree from "@@/app/components/query-builder/QueryBuilderConditionTree.vue";
import type { QueryConditionFlatNode } from "@@/types/query-condition";
import type { QuerySchemaConfig } from "@@/types/query-schema-config";
import { mountSuspended } from "@nuxt/test-utils/runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

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

const schemaConfig: QuerySchemaConfig = { fieldOptions: {}, loading: false };

// Hoisted so the mock factory can close over these values.
const mock = vi.hoisted(() => ({
  conditionNodes: [] as QueryConditionFlatNode[],
  addFieldNodeSpy: vi.fn(),
  addGroupNodeSpy: vi.fn(),
  setGroupOperatorSpy: vi.fn(),
  removeNodeSpy: vi.fn(),
}));

vi.mock("@@/stores/media-query", () => ({
  useMediaQuery: () => ({
    get conditionNodes() {
      return mock.conditionNodes;
    },
    set conditionNodes(v: QueryConditionFlatNode[]) {
      mock.conditionNodes = v;
    },
    // Static condition — component reads this once on setup
    condition: { type: "group", operator: "AND", conditions: [] },
    addFieldNode: mock.addFieldNodeSpy,
    addGroupNode: mock.addGroupNodeSpy,
    setGroupOperator: mock.setGroupOperatorSpy,
    removeNode: mock.removeNodeSpy,
    $subscribe: () => {},
    widgetOverrides: {},
  }),
}));

beforeEach(() => {
  mock.addFieldNodeSpy.mockReset();
  mock.addGroupNodeSpy.mockReset();
});

afterEach(() => {
  mock.conditionNodes = [];
});

// ── treeValue getter ──────────────────────────────────────────────────────
// PrimeVue Tree does not render its slot content in jsdom, so we test the
// treeValue computed directly via defineExpose rather than via DOM clicks.

describe("onTree > treeValue getter", () => {
  describe("buildTreeNodes", () => {
    it("sets parentGroupKey as the group's numeric id (not a string) in footer nodes", async () => {
      mock.conditionNodes = [
        { id: 1, type: "group", operator: "AND", parent: null },
        { id: 5, type: "group", operator: "AND", parent: 1 },
      ];

      const wrapper = await mountSuspended(QueryBuilderConditionTree, {
        props: { schemaConfig },
      });

      // treeValue is the children of root (id 1).
      // Group node id:5 should have a footer child with parentGroupKey === 5 (number).
      const treeValue = (
        wrapper.vm as {
          treeValue: {
            key: string;
            children?: { data?: Record<string, unknown> }[];
          }[];
        }
      ).treeValue;
      const groupNode = treeValue.find((n) => n.key === "5");
      expect(groupNode).toBeDefined();

      const footer = groupNode?.children?.find((c) => c.data?.isGroupFooter);
      expect(footer).toBeDefined();

      // This fails with the current bug where parentGroupKey is String(n.id) = "5"
      expect(footer?.data?.parentGroupKey).toBe(5);
      expect(typeof footer?.data?.parentGroupKey).toBe("number");
    });

    it("sets leaf: false on an empty group", async () => {
      mock.conditionNodes = [
        { id: 1, type: "group", operator: "AND", parent: null },
        { id: 2, type: "group", operator: "AND", parent: 1 },
      ];

      const wrapper = await mountSuspended(QueryBuilderConditionTree, {
        props: { schemaConfig },
      });

      const treeValue = (
        wrapper.vm as { treeValue: { key: string; leaf?: boolean }[] }
      ).treeValue;
      const groupNode = treeValue.find((n) => n.key === "2");
      expect(groupNode?.leaf).toBe(false);
    });

    it("footer isEmpty flag is true when the group has no children", async () => {
      mock.conditionNodes = [
        { id: 1, type: "group", operator: "AND", parent: null },
        { id: 2, type: "group", operator: "AND", parent: 1 },
      ];

      const wrapper = await mountSuspended(QueryBuilderConditionTree, {
        props: { schemaConfig },
      });

      const treeValue = (
        wrapper.vm as {
          treeValue: {
            key: string;
            children?: { data?: Record<string, unknown> }[];
          }[];
        }
      ).treeValue;
      const groupNode = treeValue.find((n) => n.key === "2");
      const footer = groupNode?.children?.find((c) => c.data?.isGroupFooter);
      expect(footer?.data?.isEmpty).toBe(true);
    });

    it("footer isEmpty flag is false when the group has children", async () => {
      mock.conditionNodes = [
        { id: 1, type: "group", operator: "AND", parent: null },
        { id: 2, type: "group", operator: "AND", parent: 1 },
        {
          id: 3,
          type: "field",
          field: "source",
          operator: "equals",
          value: "",
          parent: 2,
        },
      ];

      const wrapper = await mountSuspended(QueryBuilderConditionTree, {
        props: { schemaConfig },
      });

      const treeValue = (
        wrapper.vm as {
          treeValue: {
            key: string;
            children?: { data?: Record<string, unknown> }[];
          }[];
        }
      ).treeValue;
      const groupNode = treeValue.find((n) => n.key === "2");
      const footer = groupNode?.children?.find((c) => c.data?.isGroupFooter);
      expect(footer?.data?.isEmpty).toBe(false);
    });
  });
});

// ── Root-level add controls ───────────────────────────────────────────────
// Root buttons are rendered directly in the template (outside the Tree), so
// they ARE accessible via DOM interaction in jsdom.

describe("root-level add controls", () => {
  beforeEach(() => {
    mock.conditionNodes = [
      { id: 1, type: "group", operator: "AND", parent: null },
    ];
  });

  it("clicking Add Condition calls addFieldNode with the root group's numeric id", async () => {
    const wrapper = await mountSuspended(QueryBuilderConditionTree, {
      props: { schemaConfig },
    });

    await wrapper.find('[data-testid="root-add-condition"]').trigger("click");
    await nextTick();

    expect(mock.addFieldNodeSpy).toHaveBeenCalledOnce();
    const [parentId] = mock.addFieldNodeSpy.mock.calls.at(0) ?? [];
    expect(typeof parentId).toBe("number");
    expect(parentId).toBe(1);
  });

  it("clicking Add Subgroup calls addGroupNode with the root group's numeric id", async () => {
    const wrapper = await mountSuspended(QueryBuilderConditionTree, {
      props: { schemaConfig },
    });

    await wrapper.find('[data-testid="root-add-subgroup"]').trigger("click");
    await nextTick();

    expect(mock.addGroupNodeSpy).toHaveBeenCalledOnce();
    const [parentId] = mock.addGroupNodeSpy.mock.calls.at(0) ?? [];
    expect(typeof parentId).toBe("number");
    expect(parentId).toBe(1);
  });
});
