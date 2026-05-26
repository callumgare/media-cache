import { z } from "zod";

export const queryFieldOptionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  count: z.number().nullable().optional(),
  countAddedIfRemoved: z.number().nullable().optional(),
});

export type QueryFieldOption = z.infer<typeof queryFieldOptionSchema>;

export const querySchemaConfigSchema = z.object({
  fieldOptions: z.record(z.string(), z.array(queryFieldOptionSchema)),
  loading: z.boolean().optional(),
});

export type QuerySchemaConfig = z.infer<typeof querySchemaConfigSchema>;
