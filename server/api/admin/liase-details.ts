import { getLiase } from "@@/server/lib/liase";

export default defineEventHandler(async () => {
  const liase = await getLiase();
  return {
    sources: Object.fromEntries(
      Object.values(liase.sources).map((source) => [
        source.id,
        {
          id: source.id,
          name: source.displayName,
          requestHandlers: source.requestHandlers.map((handler) => ({
            id: handler.id,
            name: handler.displayName,
            schema: handler.requestSchema.toJSONSchema({
              unrepresentable: "any",
            }),
            secretsSchema: handler.secretsSchema
              ? handler.secretsSchema.toJSONSchema({ unrepresentable: "any" })
              : null,
          })),
        },
      ]),
    ),
  };
});
