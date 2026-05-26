import { z } from "zod";

export const sortConfigSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("random") }),
  z.object({
    field: z.enum([
      "createdOrUploadedAt",
      "firstIndexedAt",
      "updatedAt",
      "duration",
      "title",
    ]),
    direction: z.enum(["asc", "desc"]),
  }),
]);

export type SortConfig = z.infer<typeof sortConfigSchema>;
