<script setup lang="ts">
defineProps<{
  group: {
    id: number;
    name: string;
    previewImages: string[];
    subgroupCount: number;
    mediaCount: number;
  };
}>();
</script>

<template>
  <NuxtLink :to="`/groups/${group.id}`" class="group-card">
    <div class="preview-grid">
      <div
        v-for="(img, i) in group.previewImages.slice(0, 4)"
        :key="i"
        class="preview-cell"
      >
        <img :src="img" :alt="''" loading="lazy" />
      </div>
      <div
        v-for="i in Math.max(0, 1 - group.previewImages.length)"
        :key="`empty-${i}`"
        class="preview-cell empty"
      />
    </div>
    <div class="group-name">
      <span class="group-name-text">
        <div class="overflow-container">
          {{ group.name }}
        </div>
      </span>
      <span class="group-stats">
        <span class="stat" :title="`${group.subgroupCount.toLocaleString()} subgroup${group.subgroupCount === 1 ? '' : 's'}`">
          <i class="pi pi-folder" />
          {{ group.subgroupCount.toLocaleString() }}
        </span>
        <span class="stat" :title="`${group.mediaCount.toLocaleString()} media item${group.mediaCount === 1 ? '' : 's'}`">
          <i class="pi pi-images" />
          {{ group.mediaCount.toLocaleString() }}
        </span>
      </span>
    </div>
  </NuxtLink>
</template>

<style scoped>
  .group-card {
    display: block;
    width: 180px;
    height: 180px;
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    text-decoration: none;
    background: var(--p-surface-200, #e0e0e0);
    cursor: pointer;

    &:hover .group-name {
      background: rgba(0, 0, 0, 0.6);
    }
  }

  .preview-grid {
    display: grid;
    width: 100%;
    height: 100%;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;

    /* When only 1 image, span the whole grid */
    &:has(.preview-cell:only-child) .preview-cell {
      grid-column: 1 / -1;
      grid-row: 1 / -1;
    }

    /* When 2 images, each spans a row */
    &:has(.preview-cell:nth-child(2)):not(:has(.preview-cell:nth-child(3))) .preview-cell {
      grid-column: 1 / -1;
    }

    /* When 3 images, the last one spans both columns of the second row */
    &:has(.preview-cell:nth-child(3)):not(:has(.preview-cell:nth-child(4))) .preview-cell:nth-child(3) {
      grid-column: 1 / -1;
    }
  }

  .preview-cell {
    overflow: hidden;

    &.empty {
      background: var(--p-surface-300, #c0c0c0);
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }

  .group-name {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.51rem 0.75rem;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
    color: #fff;
    font-weight: 600;
    font-size: 0.95rem;
    transition: background 0.2s ease;
    display: flex;
    flex-wrap: wrap-reverse;
    align-items: center;
    column-gap: 1rem;
  }

  .group-name-text {
    flex: 1;
    font-size: 1.8rem;

    .overflow-container {
      line-height: 1.2;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 4; /* number of lines before truncating */
      overflow: hidden;
      line-clamp: 3;
    }
  }

  .group-stats {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: end;
    gap: 0.4rem;
    flex: 1 2 10%;
    font-size: 0.8rem;
    font-weight: 400;
    opacity: 0.9;
    min-height: 1.6rem;
    /* max-width: 50%; */
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 0.2rem;

    .pi {
      font-size: 0.75rem;
    }
  }
</style>
