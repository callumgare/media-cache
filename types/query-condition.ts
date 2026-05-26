import { z } from "zod";

export type QueryGroupCondition = {
  id: number;
  type: "group";
  operator: "AND" | "OR";
  name?: string;
  conditions: QueryCondition[];
};

export type QueryFieldCondition = {
  id: number;
  type: "field";
  field: string;
  operator: string;
  value?: unknown;
};

export type QueryCondition = QueryGroupCondition | QueryFieldCondition;

export const queryConditionGroupSchema = z.object({
  id: z.number(),
  type: z.literal("group"),
  operator: z.enum(["AND", "OR"]),
  name: z.string().optional(),
  conditions: z.lazy(() => queryConditionSchema.array()),
});

export const queryConditionFieldSchema = z.object({
  id: z.number(),
  type: z.literal("field"),
  field: z.string(),
  operator: z.string(),
  value: z.unknown(),
});

export const queryConditionSchema: z.ZodType<QueryCondition> = z.union([
  queryConditionGroupSchema,
  queryConditionFieldSchema,
]);

// Flat (parent-pointer) representations used by the media-query store and saved searches.
export type QueryConditionFlatNode = (
  | Omit<QueryGroupCondition, "conditions">
  | QueryFieldCondition
) & { parent: number | null };

export type QueryConditionFlatFieldNode = Extract<
  QueryConditionFlatNode,
  { type: "field" }
>;

export const queryConditionFlatNodeSchema = z.union([
  queryConditionGroupSchema.omit({ conditions: true }).extend({
    parent: z.number().nullable(),
  }),
  queryConditionFieldSchema.extend({ parent: z.number().nullable() }),
]);
