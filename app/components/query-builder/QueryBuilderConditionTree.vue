<script setup lang="ts">
import { useMediaQuery } from "@@/stores/media-query";
import type { QueryConditionFlatNode } from "@@/types/query-condition";
import { QUERY_FIELD_DEFINITIONS } from "@@/types/query-field-definitions";
import type { QuerySchemaConfig } from "@@/types/query-schema-config";
import type { TreeNode } from "primevue/treenode";

const props = defineProps<{
  schemaConfig: QuerySchemaConfig;
}>();

const mediaQuery = useMediaQuery();

const rootNode = computed(() =>
  mediaQuery.conditionNodes.find((n) => n.parent === null),
);

function buildTreeNodes(parentId: number): TreeNode[] {
  return mediaQuery.conditionNodes
    .filter((n) => n.parent === parentId)
    .map((n): TreeNode => {
      if (n.type === "group") {
        const children = buildTreeNodes(n.id);
        // Append a synthetic footer node so add-buttons appear below children
        children.push({
          key: `${n.id}-footer`,
          data: {
            parentGroupKey: n.id,
            isGroupFooter: true,
            isEmpty: children.length === 0,
          },
          type: "group-footer",
          leaf: false,
          draggable: false,
        });
        return {
          key: String(n.id),
          data: { ...n },
          type: "group",
          leaf: false,
          children,
        };
      }
      return {
        key: String(n.id),
        data: { ...n },
        type: "field",
        leaf: true,
      };
    });
}

function extractFlatNodes(
  treeNodes: TreeNode[],
  parentId: number,
): QueryConditionFlatNode[] {
  const result: QueryConditionFlatNode[] = [];
  for (const tn of treeNodes) {
    if (tn.type === "group-footer") continue; // synthetic node — not a real condition
    const data = tn.data as QueryConditionFlatNode | undefined;
    if (!data) continue;
    result.push({ ...data, parent: parentId });
    if (tn.children?.length) {
      result.push(...extractFlatNodes(tn.children, data.id));
    }
  }
  return result;
}

/** Remove a node by key from anywhere in the tree (including footers). */
function removeNodeFromTree(nodes: TreeNode[], key: string): TreeNode[] {
  return nodes
    .filter((n) => n.key !== key)
    .map((n) => ({
      ...n,
      children: n.children ? removeNodeFromTree(n.children, key) : undefined,
    }));
}

/** Insert nodeToAdd as the last real child of the group identified by parentKey
 *  (i.e. just before the synthetic footer, which is always the last element). */
function addNodeBeforeFooter(
  nodes: TreeNode[],
  parentKey: string,
  nodeToAdd: TreeNode,
): TreeNode[] {
  return nodes.map((n) => {
    if (n.key === parentKey) {
      const children = n.children ?? [];
      const footerIdx = children.findIndex((c) => c.type === "group-footer");
      const insertAt = footerIdx >= 0 ? footerIdx : children.length;
      return {
        ...n,
        children: [
          ...children.slice(0, insertAt),
          nodeToAdd,
          ...children.slice(insertAt),
        ],
      };
    }
    if (n.children) {
      return {
        ...n,
        children: addNodeBeforeFooter(n.children, parentKey, nodeToAdd),
      };
    }
    return n;
  });
}

// Two-way computed: store ↔ PrimeVue TreeNode[]
const treeValue = computed({
  get(): TreeNode[] {
    if (!rootNode.value) return [];
    const root = rootNode.value;
    return buildTreeNodes(root.id);
  },
  set(newNodes: TreeNode[]) {
    const root = rootNode.value;
    if (!root) return;
    mediaQuery.conditionNodes = [
      { ...root },
      ...extractFlatNodes(newNodes, root.id),
    ];
  },
});

function onNodeDrop(
  event: import("primevue/tree").TreeNodeDropEvent & { accept?: () => void },
) {
  const { dragNode, dropNode, dropPosition } = event;

  // Prevent dropping a node onto itself (would delete it)
  if (!dragNode || !dragNode.key || dragNode.key === dropNode?.key) return;

  // Dropping "inside" a footer node → redirect as last real child of parent group
  if (dropNode?.data?.isGroupFooter && dropPosition === 0) {
    const parentKey = String(dropNode.data.parentGroupKey);
    let newTree = removeNodeFromTree(treeValue.value, dragNode.key);
    newTree = addNodeBeforeFooter(newTree, parentKey, dragNode);
    treeValue.value = newTree;
    return;
  }

  // Before/after footer drops land inside the group (PrimeVue handles sibling insertion).
  // All other normal drops are accepted as-is.
  event.accept?.();
}

// Always keep all group nodes expanded — ignore collapse attempts
const expandedKeys = computed({
  get(): Record<string, boolean> {
    const keys: Record<string, boolean> = {};
    for (const n of mediaQuery.conditionNodes) {
      if (n.type === "group" && n.parent !== null) {
        keys[String(n.id)] = true;
      }
    }
    return keys;
  },
  set(_: Record<string, boolean>) {
    // no-op: always keep all groups expanded
  },
});

// === Drag handle: only allow group drag when initiated from the vertical bar ===
const treeWrap = ref<HTMLElement | null>(null);
const isHandleMousedown = ref(false);

function onHandleMousedown() {
  isHandleMousedown.value = true;
  window.addEventListener(
    "mouseup",
    () => {
      isHandleMousedown.value = false;
    },
    { once: true },
  );
}

let dragStartCapture: ((e: Event) => void) | null = null;

onMounted(() => {
  dragStartCapture = (e: Event) => {
    const nodeContent = (e.target as Element | null)?.closest(
      ".p-tree-node-content",
    );
    const parentLi = nodeContent?.parentElement;
    const isGroupHeader =
      parentLi?.classList.contains("p-tree-node") &&
      !parentLi?.classList.contains("p-tree-node-leaf");
    if (isGroupHeader && !isHandleMousedown.value) {
      e.preventDefault();
    }
  };
  treeWrap.value?.addEventListener("dragstart", dragStartCapture, {
    capture: true,
  });
});

onUnmounted(() => {
  if (dragStartCapture) {
    treeWrap.value?.removeEventListener("dragstart", dragStartCapture, {
      capture: true,
    });
  }
});

defineExpose({ treeValue });
</script>

<template>
  <div ref="treeWrap" class="condition-tree-wrap">
    <Tree
      v-model:value="treeValue"
      v-model:expandedKeys="expandedKeys"
      draggable-nodes
      droppable-nodes
      validate-drop
      class="condition-tree"
      :pt="{
        nodeToggleButton: { style: { display: 'none' } },
      }"
      @node-drop="onNodeDrop"
    >
      <template #field="{ node }">
        <QueryBuilderFieldConditionEdit
          :field-condition="node.data"
          :schema-config="schemaConfig"
        />
      </template>

      <template #group="{ node }">
        <div class="group-drag-handle" @mousedown="onHandleMousedown" />
        <div class="group-header">
          <label class="select-field">
            <span class="select-label">Group Condition</span>
            <Select
              :model-value="node.data.operator"
              :options="[
                { value: 'AND', label: 'AND' },
                { value: 'OR', label: 'OR' },
              ]"
              option-value="value"
              option-label="label"
              @update:model-value="
                (op: 'AND' | 'OR') =>
                  mediaQuery.setGroupOperator(node.data.id, op)
              "
            />
          </label>
          <Button
            icon="pi pi-trash"
            size="small"
            severity="danger"
            text
            aria-label="Delete group"
            @click="mediaQuery.removeNode(node.data.id)"
          />
        </div>
      </template>

      <template #group-footer="{ node }">
        <div class="group-footer">
          <div v-if="node.data.isEmpty" class="empty-group-message">- Group is empty -</div>
          <Button
            label="Condition"
            icon="pi pi-plus"
            icon-pos="left"
            size="small"
            severity="secondary"
            class="add-btn"
            data-testid="group-add-condition"
            @click="
              mediaQuery.addFieldNode(
                node.data.parentGroupKey,
                QUERY_FIELD_DEFINITIONS[0]?.id ?? 'source',
              )
            "
          />
          <Button
            label="Subgroup"
            icon="pi pi-plus"
            icon-pos="left"
            size="small"
            severity="secondary"
            class="add-btn"
            data-testid="group-add-subgroup"
            @click="mediaQuery.addGroupNode(node.data.parentGroupKey)"
          />
        </div>
      </template>
    </Tree>
    <div v-if="rootNode" class="group-footer">
      <Button
        label="Condition"
        icon="pi pi-plus"
        icon-pos="left"
        size="small"
        severity="secondary"
        class="add-btn"
        data-testid="root-add-condition"
        @click="
          mediaQuery.addFieldNode(
            rootNode.id,
            QUERY_FIELD_DEFINITIONS[0]?.id ?? 'source',
          )
        "
      />
      <Button
        label="Subgroup"
        icon="pi pi-plus"
        icon-pos="left"
        size="small"
        severity="secondary"
        class="add-btn"
        data-testid="root-add-subgroup"
        @click="mediaQuery.addGroupNode(rootNode.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.condition-tree-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.5em;
}

/* Strip PrimeVue Tree's own card/border styling */
:deep(.p-tree) {
  padding: 0;
  border: none;
  background: transparent;
}

:deep(.p-tree-root-children) {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5em;
}

:deep(.p-tree-node) {
  padding: 0;
}

/* Remove default highlight/hover on the content row, but allow drag-over indicator */
:deep(.p-tree-node-content) {
  padding: 0 !important;
  box-shadow: none !important;
  border-radius: 0 !important;

  &:not(.p-tree-node-dragover) {
    background: transparent !important;
  }

  &:hover:not(.p-tree-node-dragover),
  &:focus-visible:not(.p-tree-node-dragover),
  &.p-tree-node-selected:not(.p-tree-node-dragover) {
    background: transparent !important;
  }
}

:deep(.p-tree-node-label) {
  width: 100%;
  flex: 1;
}

:deep(.p-tree-node-icon) {
  display: none;
}

/* Hide the expand/collapse toggle — groups are always expanded */
:deep(.p-tree-node-toggle-button) {
  display: none !important;
}

/* Left-bracket visual + drag-handle for group nodes.
   PrimeVue adds .p-tree-node-leaf to leaf nodes, so :not(.p-tree-node-leaf) = group. */
:deep(.p-tree-node:not(.p-tree-node-leaf)) {
  position: relative;
  padding-left: 1.25em;
  display: flex;
  flex-direction: column;

  /* Children list renders after header */
  & > .p-tree-node-children {
    order: 1;
  }

  /* Group header (operator + delete) renders first */
  & > .p-tree-node-content {
    order: 0;
  }
}

/* Leaf nodes must never get the group bar even if nested inside a group node */
:deep(.p-tree-node-leaf) {
  padding-left: 0 !important;
}

/* Children container: layout only, no bar (bar is on the parent group node) */
:deep(.p-tree-node-children) {
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5em;
}

/* === Group header / footer drag-over: replace background with a drop-line === */

/* Suppress the default hover background when a group header is the drag target */
:deep(.p-tree-node:not(.p-tree-node-leaf) > .p-tree-node-content.p-tree-node-dragover) {
  background: transparent !important;
}

/* Suppress the default hover background when the footer itself is the drag target */
:deep(.p-tree-node-content.p-tree-node-dragover:has(.group-footer)) {
  background: transparent !important;
}

/* Show a PrimeVue-style drop-point line just before the footer when:
   (a) the group header is hovered, or (b) the footer itself is hovered */
:deep(.p-tree-node:not(.p-tree-node-leaf):has(> .p-tree-node-content.p-tree-node-dragover) > .p-tree-node-children > li:has(.group-footer))::before {
  content: "";
  display: block;
  height: 0;
  outline: 1px solid var(--p-primary-color);
}

:deep(li:has(> .p-tree-node-content.p-tree-node-dragover .group-footer))::before {
  content: "";
  display: block;
  height: 0;
  outline: 1px solid var(--p-primary-color);
}

.group-drag-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0.75em; /* wider than the visual bar for easier grabbing */
  cursor: grab;
  z-index: 1;

  /* Visual bar */
  &::after {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--p-content-border-color);
    transition: background 0.15s;
  }

  &:hover::after {
    background: var(--p-primary-color);
  }

  &:active {
    cursor: grabbing;
  }
}

.select-field {
  display: flex;
  flex-direction: column;
  gap: 0.15em;
}

.select-label {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  line-height: 1;
}

.group-header {
  display: flex;
  align-items: flex-end;
  gap: 0.5em;
  flex-wrap: wrap;
  padding: 0.25em 0;
}

.group-footer {
  display: flex;
  gap: 0.5em;
  flex-wrap: wrap;
  align-items: center;
  padding: 0.25em 0;

  .empty-group-message {
    width: 100%;
    font-size: 0.8rem;
    color: var(--p-text-muted-color);
    font-style: italic;
    margin: 0;
  }
}

.add-btn {
  font-size: 0.75rem;
}
</style>
