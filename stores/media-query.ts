import type {
  QueryCondition,
  QueryConditionFlatFieldNode,
  QueryConditionFlatNode,
  QueryFieldCondition,
  QueryGroupCondition,
} from "@@/types/query-condition.js";
import {
  QUERY_FIELD_DEFINITIONS,
  type QueryFieldDataType,
} from "@@/types/query-field-definitions.js";
import type { WidgetId } from "@@/types/query-field-type-definitions.js";
import { QUERY_FIELD_TYPE_DEFINITIONS } from "@@/types/query-field-type-definitions.js";
import type { SortConfig } from "@@/types/sort-config.js";
import { defineStore } from "pinia";

export type { QueryConditionFlatNode, QueryConditionFlatFieldNode };

// Default value for a newly created field node, keyed by data type.
function defaultValueForDataType(dataType: QueryFieldDataType): unknown {
  if (dataType === "list-of-ids") return [];
  return "";
}

function nextId(nodes: QueryConditionFlatNode[]): number {
  return nodes.length === 0 ? 1 : Math.max(...nodes.map((n) => n.id)) + 1;
}

export const useMediaQuery = defineStore("media-query", {
  state: (): {
    conditionNodes: QueryConditionFlatNode[];
    sort: SortConfig;
    randomSeed: number;
    widgetOverrides: Record<number, WidgetId>;
  } => {
    return {
      conditionNodes: [
        {
          id: 1,
          type: "group",
          operator: "AND",
          parent: null,
        },
        {
          id: 2,
          type: "field",
          field: "source",
          operator: "equals",
          value: "",
          parent: 1,
        },
        {
          id: 3,
          type: "field",
          field: "tags",
          operator: "includes all",
          value: "",
          parent: 1,
        },
        {
          id: 4,
          type: "field",
          field: "type",
          operator: "equals",
          value: "",
          parent: 1,
        },
        {
          id: 5,
          type: "field",
          field: "groups",
          operator: "includes all",
          value: "",
          parent: 1,
        },
        {
          id: 6,
          type: "field",
          field: "duration",
          operator: "is between",
          value: "",
          parent: 1,
        },
      ],
      sort: { field: "random" } satisfies SortConfig,
      randomSeed: Math.floor(Math.random() * 100000),
      widgetOverrides: {} as Record<number, WidgetId>,
    };
  },
  getters: {
    condition(): QueryGroupCondition {
      const rootFlatNode = this.conditionNodes.find(
        (node) => node.parent === null,
      );
      if (!rootFlatNode) {
        throw Error("No root condition node found");
      }
      if (rootFlatNode.type === "field") {
        throw Error("Root condition node must be of type group");
      }
      const { parent, ...otherRootTreeNodeAttrs } = rootFlatNode;
      const rootTreeNode = {
        ...otherRootTreeNodeAttrs,
        conditions: getChildTreeConditions(rootFlatNode, this.conditionNodes),
      };
      return rootTreeNode;
    },
  },
  actions: {
    setFieldConditionValue(condition: QueryFieldCondition, newValue: unknown) {
      const nodeIndex = this.conditionNodes.findIndex(
        (node) => node.id === condition.id,
      );
      const node = this.conditionNodes[nodeIndex];
      if (!node || node.type !== "field") {
        throw Error(
          `Could not find correct node for condition: ${JSON.stringify(condition)}`,
        );
      }
      this.conditionNodes[nodeIndex] = {
        ...node,
        value: newValue,
      };
    },

    addFieldNode(parentId: number, fieldId: string) {
      const fieldDef = QUERY_FIELD_DEFINITIONS.find((f) => f.id === fieldId);
      const fieldTypeDef = fieldDef
        ? QUERY_FIELD_TYPE_DEFINITIONS.find(
            (t) => t.dataType === fieldDef.dataType,
          )
        : undefined;
      const newNode: QueryConditionFlatNode = {
        id: nextId(this.conditionNodes),
        type: "field",
        field: fieldId,
        operator: fieldTypeDef?.operators[0]?.id ?? "equals",
        value: fieldDef ? defaultValueForDataType(fieldDef.dataType) : "",
        parent: parentId,
      };
      this.conditionNodes.push(newNode);
    },

    addGroupNode(parentId: number) {
      const newNode: QueryConditionFlatNode = {
        id: nextId(this.conditionNodes),
        type: "group",
        operator: "AND",
        parent: parentId,
      };
      this.conditionNodes.push(newNode);
    },

    removeNode(nodeId: number) {
      // Collect IDs of the node and all its descendants
      const toRemove = new Set<number>();
      const queue = [nodeId];
      while (queue.length) {
        const id = queue.shift();
        if (id === undefined) break;
        toRemove.add(id);
        for (const n of this.conditionNodes.filter((n) => n.parent === id)) {
          queue.push(n.id);
        }
      }
      this.conditionNodes = this.conditionNodes.filter(
        (n) => !toRemove.has(n.id),
      );
      // Clean up any widget overrides for removed nodes
      for (const id of toRemove) {
        delete this.widgetOverrides[id];
      }
    },

    moveNode(nodeId: number, newParentId: number, afterNodeId: number | null) {
      const nodeIndex = this.conditionNodes.findIndex((n) => n.id === nodeId);
      if (nodeIndex === -1) return;
      const node = this.conditionNodes[nodeIndex];
      if (!node) return;
      // Prevent moving a group into one of its own descendants
      let cursor: number | null = newParentId;
      while (cursor !== null) {
        if (cursor === nodeId) return;
        cursor =
          this.conditionNodes.find((n) => n.id === cursor)?.parent ?? null;
      }
      this.conditionNodes[nodeIndex] = { ...node, parent: newParentId };
      if (afterNodeId !== null) {
        // Reorder: move the node after the target sibling
        const siblings = this.conditionNodes.filter(
          (n) => n.parent === newParentId,
        );
        const afterIndex = siblings.findIndex((n) => n.id === afterNodeId);
        if (afterIndex !== -1) {
          this.conditionNodes.splice(nodeIndex, 1);
          const insertAt =
            this.conditionNodes.findIndex((n) => n.id === afterNodeId) + 1;
          this.conditionNodes.splice(insertAt, 0, {
            ...node,
            parent: newParentId,
          });
        }
      }
    },

    setGroupOperator(nodeId: number, operator: "AND" | "OR") {
      const nodeIndex = this.conditionNodes.findIndex((n) => n.id === nodeId);
      const node = this.conditionNodes[nodeIndex];
      if (!node || node.type !== "group") return;
      this.conditionNodes[nodeIndex] = { ...node, operator };
    },

    setOperator(nodeId: number, operator: string) {
      const nodeIndex = this.conditionNodes.findIndex((n) => n.id === nodeId);
      const node = this.conditionNodes[nodeIndex];
      if (!node || node.type !== "field") return;
      this.conditionNodes[nodeIndex] = { ...node, operator };
    },

    setFieldType(nodeId: number, fieldId: string) {
      const nodeIndex = this.conditionNodes.findIndex((n) => n.id === nodeId);
      const node = this.conditionNodes[nodeIndex];
      if (!node || node.type !== "field") return;
      const fieldDef = QUERY_FIELD_DEFINITIONS.find((f) => f.id === fieldId);
      const fieldTypeDef = fieldDef
        ? QUERY_FIELD_TYPE_DEFINITIONS.find(
            (t) => t.dataType === fieldDef.dataType,
          )
        : undefined;
      this.conditionNodes[nodeIndex] = {
        ...node,
        field: fieldId,
        operator: fieldTypeDef?.operators[0]?.id ?? "equals",
        value: fieldDef ? defaultValueForDataType(fieldDef.dataType) : "",
      };
      // Reset any widget override since the field type may have changed
      delete this.widgetOverrides[nodeId];
    },

    setWidgetOverride(nodeId: number, widget: WidgetId | null) {
      if (widget === null) {
        delete this.widgetOverrides[nodeId];
      } else {
        this.widgetOverrides[nodeId] = widget;
      }
    },

    setSort(sort: SortConfig) {
      this.sort = sort;
      if (sort.field === "random") {
        this.randomSeed = Math.floor(Math.random() * 100000);
      }
    },

    reshuffleRandomSeed() {
      this.randomSeed = Math.floor(Math.random() * 100000);
    },

    /** Replace the entire store state — used when loading a saved search. */
    loadSavedSearch(payload: {
      conditionNodes: QueryConditionFlatNode[];
      sort: SortConfig;
      widgetOverrides: Record<number, WidgetId>;
    }) {
      this.conditionNodes = payload.conditionNodes;
      this.sort = payload.sort;
      this.widgetOverrides = payload.widgetOverrides;
      if (payload.sort.field === "random") {
        this.randomSeed = Math.floor(Math.random() * 100000);
      }
    },
  },
  persistExtended: {
    defaultStorage: "sessionStorage",
  },
});

function getChildTreeConditions(
  parentNode: QueryConditionFlatNode,
  nodes: QueryConditionFlatNode[],
): QueryCondition[] {
  const children = nodes.filter((node) => node.parent === parentNode.id);
  const childTreeNodes: QueryCondition[] = [];
  for (const flatNode of children) {
    const { parent, ...otherNodeAttrs } = flatNode;
    let treeNode: QueryCondition;
    if (otherNodeAttrs.type === "group") {
      treeNode = {
        ...otherNodeAttrs,
        conditions: getChildTreeConditions(flatNode, nodes),
      } satisfies QueryGroupCondition;
    } else {
      treeNode = otherNodeAttrs;
    }
    childTreeNodes.push(treeNode);
  }
  return childTreeNodes;
}
