import { useMediaQuery } from "@@/stores/media-query";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

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

beforeEach(() => {
  setActivePinia(createPinia());
});

// ── addFieldNode ──────────────────────────────────────────────────────────

describe("media-query store — addFieldNode", () => {
  it("appends a field node under the specified parent", () => {
    const store = useMediaQuery();
    const before = store.conditionNodes.length;
    store.addFieldNode(1, "tags");

    expect(store.conditionNodes).toHaveLength(before + 1);
    const added = store.conditionNodes.at(-1);
    expect(added?.type).toBe("field");
    if (added?.type === "field") expect(added.field).toBe("tags");
    expect(added?.parent).toBe(1);
  });

  it("assigns an id strictly greater than the current maximum", () => {
    const store = useMediaQuery();
    const maxBefore = Math.max(...store.conditionNodes.map((n) => n.id));
    store.addFieldNode(1, "source");

    const added = store.conditionNodes.at(-1);
    expect(added?.id).toBeGreaterThan(maxBefore);
  });

  it("uses the default operator for the field's data type (list-of-ids → includes all)", () => {
    const store = useMediaQuery();
    store.addFieldNode(1, "tags");

    const added = store.conditionNodes.at(-1);
    if (added?.type === "field") expect(added.operator).toBe("includes all");
  });

  it("uses the default operator for the field's data type (text → equals)", () => {
    const store = useMediaQuery();
    store.addFieldNode(1, "source");

    const added = store.conditionNodes.at(-1);
    if (added?.type === "field") expect(added.operator).toBe("equals");
  });

  it("sets an empty array as the default value for list-of-ids fields", () => {
    const store = useMediaQuery();
    store.addFieldNode(1, "tags");

    const added = store.conditionNodes.at(-1);
    if (added?.type === "field") expect(added.value).toEqual([]);
  });

  it("sets an empty string as the default value for text fields", () => {
    const store = useMediaQuery();
    store.addFieldNode(1, "source");

    const added = store.conditionNodes.at(-1);
    if (added?.type === "field") expect(added.value).toBe("");
  });
});

// ── addGroupNode ──────────────────────────────────────────────────────────

describe("media-query store — addGroupNode", () => {
  it("appends a group node with AND operator under the specified parent", () => {
    const store = useMediaQuery();
    const before = store.conditionNodes.length;
    store.addGroupNode(1);

    expect(store.conditionNodes).toHaveLength(before + 1);
    const added = store.conditionNodes.at(-1);
    expect(added?.type).toBe("group");
    expect(added?.parent).toBe(1);
    if (added?.type === "group") expect(added.operator).toBe("AND");
  });

  it("assigns an id strictly greater than the current maximum", () => {
    const store = useMediaQuery();
    const maxBefore = Math.max(...store.conditionNodes.map((n) => n.id));
    store.addGroupNode(1);

    const added = store.conditionNodes.at(-1);
    expect(added?.id).toBeGreaterThan(maxBefore);
  });
});

// ── removeNode ────────────────────────────────────────────────────────────

describe("media-query store — removeNode", () => {
  it("removes the node itself", () => {
    const store = useMediaQuery();
    store.removeNode(2);
    expect(store.conditionNodes.find((n) => n.id === 2)).toBeUndefined();
  });

  it("removes all descendants recursively", () => {
    const store = useMediaQuery();
    store.addGroupNode(1);
    const sub = store.conditionNodes.at(-1);
    if (sub === undefined)
      throw new Error("Expected a node after addGroupNode");
    const subId = sub.id;
    store.addFieldNode(subId, "tags");
    const childId = store.conditionNodes.at(-1)?.id;

    store.removeNode(subId);

    expect(store.conditionNodes.find((n) => n.id === subId)).toBeUndefined();
    expect(store.conditionNodes.find((n) => n.id === childId)).toBeUndefined();
  });

  it("removes widgetOverrides for every deleted node", () => {
    const store = useMediaQuery();
    store.setWidgetOverride(2, "listbox");
    expect(store.widgetOverrides[2]).toBe("listbox");

    store.removeNode(2);

    expect(store.widgetOverrides[2]).toBeUndefined();
  });

  it("does not affect unrelated nodes", () => {
    const store = useMediaQuery();
    const before = store.conditionNodes.filter((n) => n.id !== 2).length;
    store.removeNode(2);

    expect(store.conditionNodes).toHaveLength(before);
  });
});

// ── setGroupOperator ──────────────────────────────────────────────────────

describe("media-query store — setGroupOperator", () => {
  it("changes a group node's operator to OR", () => {
    const store = useMediaQuery();
    const rootId = store.conditionNodes.find((n) => n.parent === null)?.id;
    if (rootId === undefined) throw new Error("Expected root node");
    store.setGroupOperator(rootId, "OR");

    const node = store.conditionNodes.find((n) => n.id === rootId);
    if (node?.type === "group") expect(node.operator).toBe("OR");
  });

  it("changes a group node's operator back to AND", () => {
    const store = useMediaQuery();
    const rootId = store.conditionNodes.find((n) => n.parent === null)?.id;
    if (rootId === undefined) throw new Error("Expected root node");
    store.setGroupOperator(rootId, "OR");
    store.setGroupOperator(rootId, "AND");

    const node = store.conditionNodes.find((n) => n.id === rootId);
    if (node?.type === "group") expect(node.operator).toBe("AND");
  });

  it("does nothing when the nodeId refers to a field node", () => {
    const store = useMediaQuery();
    const before = store.conditionNodes.map((n) => ({ ...n }));
    store.setGroupOperator(2, "OR"); // node 2 is a field

    expect(store.conditionNodes).toEqual(before);
  });
});

// ── setFieldType ──────────────────────────────────────────────────────────

describe("media-query store — setFieldType", () => {
  it("changes the field id of the node", () => {
    const store = useMediaQuery();
    store.setFieldType(2, "tags");

    const node = store.conditionNodes.find((n) => n.id === 2);
    if (node?.type === "field") expect(node.field).toBe("tags");
  });

  it("resets the operator to the new field type's default", () => {
    const store = useMediaQuery();
    // Node 2 starts as "source" (operator: "equals")
    store.setFieldType(2, "tags"); // list-of-ids default = "includes all"

    const node = store.conditionNodes.find((n) => n.id === 2);
    if (node?.type === "field") expect(node.operator).toBe("includes all");
  });

  it("resets the value to the new field type's default", () => {
    const store = useMediaQuery();
    store.setFieldType(2, "tags"); // list-of-ids default = []

    const node = store.conditionNodes.find((n) => n.id === 2);
    if (node?.type === "field") expect(node.value).toEqual([]);
  });

  it("clears any existing widget override for the node", () => {
    const store = useMediaQuery();
    store.setWidgetOverride(2, "listbox");
    store.setFieldType(2, "source");

    expect(store.widgetOverrides[2]).toBeUndefined();
  });
});

// ── setWidgetOverride ─────────────────────────────────────────────────────

describe("media-query store — setWidgetOverride", () => {
  it("stores a widget override for a node", () => {
    const store = useMediaQuery();
    store.setWidgetOverride(2, "listbox");

    expect(store.widgetOverrides[2]).toBe("listbox");
  });

  it("can overwrite an existing override", () => {
    const store = useMediaQuery();
    store.setWidgetOverride(2, "listbox");
    store.setWidgetOverride(2, "multi-select-dropdown");

    expect(store.widgetOverrides[2]).toBe("multi-select-dropdown");
  });

  it("removes the override when called with null", () => {
    const store = useMediaQuery();
    store.setWidgetOverride(2, "listbox");
    store.setWidgetOverride(2, null);

    expect(store.widgetOverrides[2]).toBeUndefined();
  });
});

// ── moveNode ──────────────────────────────────────────────────────────────

describe("media-query store — moveNode", () => {
  it("reparents a node to a new parent", () => {
    const store = useMediaQuery();
    store.addGroupNode(1);
    const sub = store.conditionNodes.at(-1);
    if (sub === undefined)
      throw new Error("Expected a node after addGroupNode");
    const subId = sub.id;

    store.moveNode(2, subId, null);

    const node = store.conditionNodes.find((n) => n.id === 2);
    expect(node?.parent).toBe(subId);
  });

  it("does not move a group node into one of its own descendants", () => {
    const store = useMediaQuery();
    store.addGroupNode(1);
    const sub2 = store.conditionNodes.at(-1);
    if (sub2 === undefined)
      throw new Error("Expected a node after addGroupNode");
    const subId = sub2.id;
    const rootId = store.conditionNodes.find((n) => n.parent === null)?.id;
    if (rootId === undefined) throw new Error("Expected root node");

    // Attempt to move root under its own child
    store.moveNode(rootId, subId, null);

    const root = store.conditionNodes.find((n) => n.id === rootId);
    expect(root?.parent).toBeNull();
  });
});

// ── condition getter ──────────────────────────────────────────────────────

describe("media-query store — condition getter", () => {
  it("returns an object of type 'group'", () => {
    const store = useMediaQuery();
    expect(store.condition.type).toBe("group");
  });

  it("does not include parent on the root condition", () => {
    const store = useMediaQuery();
    const condition = store.condition as Record<string, unknown>;
    expect(condition.parent).toBeUndefined();
  });

  it("nests child nodes inside conditions", () => {
    const store = useMediaQuery();
    expect(store.condition.conditions.length).toBeGreaterThan(0);
  });

  it("does not expose sort or widgetOverrides on the condition", () => {
    const store = useMediaQuery();
    const condition = store.condition as Record<string, unknown>;
    expect(condition.sort).toBeUndefined();
    expect(condition.widgetOverrides).toBeUndefined();
  });

  it("reflects structural changes after addFieldNode", () => {
    const store = useMediaQuery();
    const before = store.condition.conditions.length;
    store.addFieldNode(1, "tags");

    expect(store.condition.conditions).toHaveLength(before + 1);
  });

  it("reflects structural changes after removeNode", () => {
    const store = useMediaQuery();
    const before = store.condition.conditions.length;
    store.removeNode(2);

    expect(store.condition.conditions).toHaveLength(before - 1);
  });
});
