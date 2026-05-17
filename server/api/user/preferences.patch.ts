import { z } from "zod";

const PatchSchema = z.object({
  loopVideo: z.boolean().optional(),
  muteVideo: z.boolean().optional(),
  videoFit: z.enum(["contain", "cover"]).optional(),
});

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, PatchSchema.parse);

  const user = await db
    .select({ id: dbSchema.user.id })
    .from(dbSchema.user)
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }

  const prefs = await db
    .insert(dbSchema.userPreferences)
    .values({ updatedAt: new Date(), userId: user.id, ...body })
    .onConflictDoUpdate({
      target: dbSchema.userPreferences.userId,
      set: { ...body, updatedAt: new Date() },
    })
    .returning()
    .then((rows) => rows[0] ?? null);

  return prefs;
});
