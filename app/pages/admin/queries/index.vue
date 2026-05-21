<template>
  <div>
    <QueryList />
    <NuxtLink to="/admin/queries/add">
      Add query +
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: "admin",
  breadcrumbs: ["Settings", "Queries"],
});
</script>
