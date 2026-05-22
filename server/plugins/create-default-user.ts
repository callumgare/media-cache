import { db, dbSchema } from "@@/server/utils/drizzle";

/**
 * On startup, create a default user if no users exist yet.
 */
export default defineNitroPlugin(async () => {
  const existing = await db.select().from(dbSchema.user).limit(1);
  if (existing.length > 0) return;

  const [created] = await db
    .insert(dbSchema.user)
    .values({
      username: "admin",
      updatedAt: new Date(),
    })
    .returning();

  if (!created) {
    console.error("[create-default-user] Failed to create default user");
    return;
  }

  console.log(
    `[create-default-user] Created default user: ${created.username} (id: ${created.id})`,
  );
});
