import type { QuerySecretListResponse } from "@@/types/api-secrets";
import { asc } from "drizzle-orm";

export default defineEventHandler(
  async (): Promise<QuerySecretListResponse> => {
    const secrets = await db.query.querySecret.findMany({
      orderBy: [asc(dbSchema.querySecret.createdAt)],
    });

    return secrets.map((s) => ({
      id: s.id,
      label: s.label,
      liaseSourceId: s.liaseSourceId,
      secretFieldName: s.secretFieldName,
      secretFieldType: s.secretFieldType,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  },
);
