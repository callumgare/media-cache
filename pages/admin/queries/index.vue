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
  breadcrumbs: ['Settings', 'Queries'],
})
</script>
