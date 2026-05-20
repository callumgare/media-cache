import { decryptValue } from "@@/server/lib/secrets-encryption";
import type { QuerySecretDetailResponse } from "@@/types/api-secrets";
import { createError } from "h3";

export default defineEventHandler(
  async (event): Promise<QuerySecretDetailResponse> => {
    const idParam = getRouterParam(event, "id");
    const id = Number.parseInt(idParam || "", 10);
    if (Number.isNaN(id)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid secret ID",
      });
    }

    const secret = await db.query.querySecret.findFirst({
      where: (s, { eq }) => eq(s.id, id),
    });

    if (!secret) {
      throw createError({
        statusCode: 404,
        statusMessage: `Secret with ID ${id} not found`,
      });
    }

    return {
      id: secret.id,
      label: secret.label,
      liaseSourceId: secret.liaseSourceId,
      secretFieldName: secret.secretFieldName,
      secretFieldType: secret.secretFieldType,
      value: decryptValue(secret.encryptedValue),
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    };
  },
);
