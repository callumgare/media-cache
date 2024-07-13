<template>
  <div>
    <PageHeader :breadcrumbs="['Settings', 'Queries']" />

    <QueryList />
    <NuxtLink to="/admin/queries/add">
      Add query +
    </NuxtLink>
  </div>
</template>
