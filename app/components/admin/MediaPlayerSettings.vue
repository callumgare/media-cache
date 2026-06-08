<template>
  <section class="settings-section">
    <h2 class="section-title">
      <span>Media Player</span>
    </h2>
    <section class="settings-section">
      <label id="video-start-position" class="section-title">Video Start Position</label>
      <Select
        v-model="userPreferences.videoStartPosition"
        :options="userPreferences._initialized ? videoStartPositionOptions : []"
        optionLabel="label"
        optionValue="value"
        label-id="video-start-position"
        :loading="!userPreferences._initialized"
      />
    </section>
  </section>

</template>

<script setup lang="ts">
import { videoStartPositionOptions } from "~/constants/media-player-settings";
import { useUserPreferences } from "~~/stores/user-preferences";

const userPreferences = useUserPreferences();
</script>

<style scoped>
.settings-section {
  max-width: 680px;

  .section-title {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 0.4rem;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }
  .settings-section .section-title {
    font-size: 1rem;
    font-weight: 500;
  }
}

.section-description {
  color: light-dark(var(--p-zinc-500), var(--p-zinc-400));
  margin: 0 0 1rem;
  font-size: 0.9rem;
}
</style>
