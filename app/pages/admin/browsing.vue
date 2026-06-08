<template>
  <div class="browsing-page">
    <AdminMediaPlayerSettings />
    <AdminGamepadSettings />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: "admin",
  breadcrumbs: ["Settings", "Browsing"],
});
</script>

<style scoped>
.browsing-page {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
</style>
