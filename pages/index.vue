<template>
  <div>
    <MediaList
      :medias="medias"
    />
    <button @click="() => currentPageNumberRef += 1">
      Next page
    </button>
  </div>
</template>

<script setup lang="ts">
const currentPageNumberRef = ref(1)
const { data } = useQuery({
  queryKey: ['media', currentPageNumberRef],
  queryFn: () => $fetch('/api/media', { query: { page: currentPageNumberRef.value } }),
})

const medias = computed(() => data.value?.media || [])
</script>
