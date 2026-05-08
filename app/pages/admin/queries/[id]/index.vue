<template>
  <div>
    <EditQueryForm :media-query="mediaQuery" />
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

let mediaQuery: MediaQueryFormData | undefined;

if (id === "add") {
  mediaQuery = undefined;
} else if (id.match(/^\d+$/)) {
  try {
    const data = await $fetch(`/api/admin/queries/${id}`);
    const requestOptions = isRecord(data.requestOptions)
      ? data.requestOptions
      : {};
    mediaQuery = { ...data, requestOptions };
  } catch (error) {
    console.error("Error fetching query:", error);
    throw createError({
      statusCode: 404,
      message: "Not Found",
      fatal: true,
    });
  }
} else {
  console.log("Invalid query ID:", id);
  throw createError({
    statusCode: 400,
    message: "Not Found",
    fatal: true,
  });
}
definePageMeta({
  breadcrumbs: ({ route }: { route: RouteLocationNormalizedLoaded }) => [
    "Settings",
    "Queries",
    `${route.params.id === "add" ? "Add" : "Edit"} Query`,
  ],
});
</script>
