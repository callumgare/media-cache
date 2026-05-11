<template>
  <div
    v-if="media"
    class="panel-content"
  >
      <!-- Top-level title / description (common across all sources) -->
      <h2
        v-if="media.title"
        class="media-title"
      >
        {{ media.title }}
      </h2>
      <div
        v-if="media.description"
        class="media-description"
      >
        <p
          v-for="(paragraph, i) in media.description.split('\n\n')"
          :key="i"
        >
          {{ paragraph }}
        </p>
      </div>

      <!-- Tags -->
      <div
        v-if="media.tags.length"
        class="tags-section"
      >
        <span
          v-for="tag in media.tags"
          :key="tag"
          class="tag"
        >{{ tag }}</span>
      </div>

      <!-- Per-source details -->
      <section
        v-for="src in media.sourceDetails"
        :key="src.sourceName"
        class="info-section"
      >
        <h3 class="section-heading">
          {{ src.sourceName }}
        </h3>
        <dl class="fields">
          <template v-if="src.title">
            <dt>Title</dt>
            <dd>{{ src.title }}</dd>
          </template>
          <template v-if="src.url">
            <dt>URL</dt>
            <dd>
              <a
                :href="src.url"
                target="_blank"
                rel="noopener noreferrer"
              >{{ src.url }}</a>
            </dd>
          </template>
          <template v-if="src.creator">
            <dt>Creator</dt>
            <dd>{{ src.creator }}</dd>
          </template>
          <template v-if="src.views != null">
            <dt>Views</dt>
            <dd>{{ src.views.toLocaleString() }}</dd>
          </template>
          <template v-if="src.likes != null">
            <dt>Likes</dt>
            <dd>{{ src.likes.toLocaleString() }}</dd>
          </template>
          <template v-if="src.likesPercentage != null">
            <dt>Like %</dt>
            <dd>{{ src.likesPercentage.toFixed(1) }}%</dd>
          </template>
        </dl>
      </section>

      <!-- Per-file details -->
      <section
        v-for="file in media.files"
        :key="file.type"
        class="info-section"
      >
        <h3 class="section-heading">
          File — {{ file.type }}
        </h3>
        <dl class="fields">
          <template v-if="file.width && file.height">
            <dt>Dimensions</dt>
            <dd>{{ file.width }} × {{ file.height }}</dd>
          </template>
          <template v-if="file.fileSize != null">
            <dt>File size</dt>
            <dd>{{ formatBytes(file.fileSize) }}</dd>
          </template>
          <template v-if="file.ext">
            <dt>Extension</dt>
            <dd>{{ file.ext }}</dd>
          </template>
          <template v-if="file.sourceUrl">
            <dt>Source URL</dt>
            <dd>
              <a
                :href="file.sourceUrl"
                target="_blank"
                rel="noopener noreferrer"
              >{{ file.sourceUrl }}</a>
            </dd>
          </template>
        </dl>
      </section>
  </div>

  <p
    v-else
    class="empty"
  >
    No details available.
  </p>
</template>

<script setup lang="ts">
import type { APIMediaData } from "@@/types/api-media";

defineProps<{
  media: APIMediaData | null;
}>();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<style scoped>
.panel-content {
  overflow: auto;
}

.media-title {
  font-weight: 600;
  margin: 0 0 8px;
}

.media-description {
  font-size: 0.85rem;
  margin-bottom: 10px;
}

.media-description p {
  margin: 0 0 6px;
}

.media-description p:last-child {
  margin-bottom: 0;
}

.fields {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  font-size: 0.85rem;
  margin: 0;
}

.fields dt {
  color: #aaa;
  font-weight: 500;
  white-space: nowrap;
}

.fields dd {
  margin: 0;
  word-break: break-all;
}

.fields a {
  color: #8ab4f8;
}

.info-section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgb(255 255 255 / 10%);
}

.section-heading {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #aaa;
  margin: 0 0 6px;
}

.empty {
  color: #888;
  font-size: 0.85rem;
  margin: 0;
}

.tags-section {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.tag {
  display: inline-block;
  background: rgb(255 255 255 / 15%);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.8rem;
}
</style>
