import { z } from 'zod'

export const querySchemaConfigSchema = z.object({
  availableFields: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      type: z.string(),
      availableOptions: z.array(
        z.object({
          id: z.union([z.string(), z.number()]),
          name: z.string(),
        }),
      ).optional(),
    }).strict(),
  ),
  fieldTypes: z.array(
    z.object({
      name: z.string(),
      operators: z.string().array(),
      getInputType: z.function(),
    }).strict(),
  ),
})

export type QuerySchemaConfig = z.infer<typeof querySchemaConfigSchema>
