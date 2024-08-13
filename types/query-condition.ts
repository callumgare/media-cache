import { z } from 'zod'

export type QueryGroupCondition = {
  id: number
  type: 'group'
  operator: 'AND' | 'OR'
  name?: string
  conditions: QueryCondition[]
}

export type QueryFieldCondition = {
  id: number
  type: 'field'
  field: string
  operator: string
  value?: unknown
}

export type QueryCondition = QueryGroupCondition | QueryFieldCondition

export const queryConditionGroupSchema = z.object({
  id: z.number(),
  type: z.literal('group'),
  operator: z.enum(['AND', 'OR']),
  name: z.string().optional(),
  conditions: z.lazy(() => queryConditionSchema.array()),
})

export const queryConditionFieldSchema = z.object({
  id: z.number(),
  type: z.literal('field'),
  field: z.string(),
  operator: z.string(),
  value: z.unknown(),
})

export const queryConditionSchema: z.ZodType<QueryCondition> = z.union([queryConditionGroupSchema, queryConditionFieldSchema])
