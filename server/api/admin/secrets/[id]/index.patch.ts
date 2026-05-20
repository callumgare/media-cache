import { encryptValue } from "@@/server/lib/secrets-encryption";
import type {
  QuerySecretListItem,
  QuerySecretUpdateBody,
} from "@@/types/api-secrets";
import { eq } from "drizzle-orm";
import { createError } from "h3";

export default defineEventHandler(
  async (event): Promise<QuerySecretListItem> => {
    const idParam = getRouterParam(event, "id");
    const id = Number.parseInt(idParam || "", 10);
    if (Number.isNaN(id)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid secret ID",
      });
    }

    const existing = await db.query.querySecret.findFirst({
      where: (s, { eq }) => eq(s.id, id),
    });
    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: `Secret with ID ${id} not found`,
      });
    }

    const body = await readBody<QuerySecretUpdateBody>(event);

    const updates: Partial<typeof dbSchema.querySecret.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.label !== undefined) {
      if (!body.label.trim()) {
        throw createError({
          statusCode: 400,
          statusMessage: "label cannot be empty",
        });
      }
      updates.label = body.label.trim();
    }
    if (body.value !== undefined) {
      if (!body.value) {
        throw createError({
          statusCode: 400,
          statusMessage: "value cannot be empty",
        });
      }
      updates.encryptedValue = encryptValue(body.value);
    }

    const [updated] = await db
      .update(dbSchema.querySecret)
      .set(updates)
      .where(eq(dbSchema.querySecret.id, id))
      .returning();

    if (!updated) {
      throw createError({
        statusCode: 404,
        statusMessage: `Secret with ID ${id} not found`,
      });
    }

    return {
      id: updated.id,
      label: updated.label,
      liaseSourceId: updated.liaseSourceId,
      secretFieldName: updated.secretFieldName,
      secretFieldType: updated.secretFieldType,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  },
);
