import { defineStore } from 'pinia'
import { type QueryCondition, type QueryFieldCondition, type QueryGroupCondition } from '@/types/query-condition.js'

type QueryConditionFlatNode = (Omit<QueryGroupCondition, 'conditions'> | QueryFieldCondition) & { parent: number | null }

export const useMediaQuery = defineStore('media-query', {
  state: (): { conditionNodes: QueryConditionFlatNode[] } => {
    return {
      conditionNodes: [
        {
          id: 1,
          type: 'group',
          operator: 'AND',
          parent: null,
        },
        {
          id: 2,
          type: 'field',
          field: 'source',
          operator: 'equals',
          value: '',
          parent: 1,
        },
        {
          id: 3,
          type: 'field',
          field: 'group',
          operator: 'equals',
          value: '',
          parent: 1,
        },
        {
          id: 4,
          type: 'field',
          field: 'type',
          operator: 'equals',
          value: '',
          parent: 1,
        },
      ],
    }
  },
  getters: {
    condition(): QueryGroupCondition {
      const rootFlatNode = this.conditionNodes.find(node => node.parent === null)
      if (!rootFlatNode) {
        throw Error(`No root condition node found`)
      }
      if (rootFlatNode.type === 'field') {
        throw Error(`Root condition node must be of type group`)
      }
      const { parent, ...otherRootTreeNodeAttrs } = rootFlatNode
      const rootTreeNode = {
        ...otherRootTreeNodeAttrs,
        conditions: getChildTreeConditions(rootFlatNode, this.conditionNodes),
      }
      return rootTreeNode
    },
  },
  actions: {
    setFieldConditionValue(condition: QueryFieldCondition, newValue: unknown) {
      const nodeIndex = this.conditionNodes.findIndex(node => node.id === condition.id)
      const node = this.conditionNodes[nodeIndex]
      if (!node || node.type !== 'field') {
        throw Error(`Could not find correct node for condition: ${JSON.stringify(condition)}`)
      }
      this.conditionNodes[nodeIndex] = {
        ...node,
        value: newValue,
      }
    },
  },
})

function getChildTreeConditions(parentNode: QueryConditionFlatNode, nodes: QueryConditionFlatNode[]): QueryCondition[] {
  const children = nodes.filter(node => node.parent === parentNode.id)
  const childTreeNodes: QueryCondition[] = []
  for (const flatNode of children) {
    const { parent, ...otherNodeAttrs } = flatNode
    let treeNode: QueryCondition
    if (otherNodeAttrs.type === 'group') {
      treeNode = {
        ...otherNodeAttrs,
        conditions: getChildTreeConditions(flatNode, nodes),
      } satisfies QueryGroupCondition
    }
    else {
      treeNode = otherNodeAttrs
    }
    childTreeNodes.push(treeNode)
  }
  return childTreeNodes
}
