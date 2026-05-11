<template>
  <div>
    <EditQueryForm
      :media-query="mediaQuery"
      :loading="queryRequest?.status.value === 'pending'"
    />
  </div>
</template>

<script setup lang="ts">
import type { FinderQuery } from "@@/server/database/schema";
import type { RouteLocationNormalizedLoaded } from "vue-router";

type MediaQueryFormData = Omit<
  FinderQuery,
  "requestOptions" | "createdAt" | "updatedAt"
> & {
  requestOptions: Record<string, unknown>;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const route = useRoute();
const idParam = route.params.id;
const id = typeof idParam === "string" ? idParam : idParam?.[0];

if (!id) {
  // This shouldn't be possible since if no id is provided it should match `app/pages/admin/index.vue`
  throw createError({
    statusCode: 500,
    message: "Internal Server Error",
    fatal: true,
  });
}
if (id !== "add" && !/^\d+$/.test(id)) {
  console.error("Invalid query ID:", id);
  throw createError({
    statusCode: 400,
    message: "Invalid query ID",
    fatal: true,
  });
}

const queryRequest =
  id !== "add"
    ? await useSuperFetch(`/api/admin/queries/${id}`, {
        server: false,
      })
    : null;

if (queryRequest) {
  watch(queryRequest.error, async (error) => {
    if (!error) return;
    console.error("Error fetching query data:", error);
    throw createError({ statusCode: 404, message: "Not Found", fatal: true });
  });
}

const mediaQuery = computed<MediaQueryFormData | undefined>(() => {
  const data = queryRequest?.data.value;
  if (!data) return undefined;

  const requestOptions = isRecord(data.requestOptions)
    ? data.requestOptions
    : {};
  return { ...data, requestOptions };
});

definePageMeta({
  breadcrumbs: ({ route }: { route: RouteLocationNormalizedLoaded }) => [
    "Settings",
    "Queries",
    `${route.params.id === "add" ? "Add" : "Edit"} Query`,
  ],
});
</script>
