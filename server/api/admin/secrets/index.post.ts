import { encryptValue } from "@@/server/lib/secrets-encryption";
import type {
  QuerySecretCreateBody,
  QuerySecretListItem,
} from "@@/types/api-secrets";
import { createError } from "h3";

export default defineEventHandler(
  async (event): Promise<QuerySecretListItem> => {
    const body = await readBody<QuerySecretCreateBody>(event);

    if (!body.label?.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: "label is required",
      });
    }
    if (!body.liaseSourceId?.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: "liaseSourceId is required",
      });
    }
    if (!body.secretFieldName?.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: "secretFieldName is required",
      });
    }
    if (!body.secretFieldType?.trim()) {
      throw createError({
        statusCode: 400,
        statusMessage: "secretFieldType is required",
      });
    }
    if (!body.value) {
      throw createError({
        statusCode: 400,
        statusMessage: "value is required",
      });
    }

    const [created] = await db
      .insert(dbSchema.querySecret)
      .values({
        label: body.label.trim(),
        liaseSourceId: body.liaseSourceId.trim(),
        secretFieldName: body.secretFieldName.trim(),
        secretFieldType: body.secretFieldType.trim(),
        encryptedValue: encryptValue(body.value),
        updatedAt: new Date(),
      })
      .returning();

    if (!created) {
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to create secret",
      });
    }

    return {
      id: created.id,
      label: created.label,
      liaseSourceId: created.liaseSourceId,
      secretFieldName: created.secretFieldName,
      secretFieldType: created.secretFieldType,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  },
);
