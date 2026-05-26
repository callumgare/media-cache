<template>
  <div
    v-if="media"
    class="panel-content"
  >
      <!-- Top-level title / description (common across all sources) -->
      <h2
        v-if="media.title"
        class="media-title"
        data-testid="media-info-title"
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
      <dl class="fields">
        <dt>ID</dt>
        <dd>{{ media.id }}</dd>
        <template v-if="media.duration != null">
          <dt>Duration</dt>
          <dd>{{ formatDuration(media.duration) }}</dd>
        </template>
        <template v-if="media.width && media.height">
          <dt>Dimensions</dt>
          <dd>{{ media.width }} × {{ media.height }}</dd>
        </template>
        <template v-if="media.fileSize != null">
          <dt>File size</dt>
          <dd>{{ formatBytes(media.fileSize) }}</dd>
        </template>
        <template v-if="media.views != null">
          <dt>Views</dt>
          <dd>{{ media.views.toLocaleString() }}</dd>
        </template>
        <template v-if="media.likes != null">
          <dt>Likes</dt>
          <dd>{{ media.likes.toLocaleString() }}</dd>
        </template>
        <template v-if="media.dislikes != null">
          <dt>Dislikes</dt>
          <dd>{{ media.dislikes.toLocaleString() }}</dd>
        </template>
        <template v-if="media.hasVideo != null">
          <dt>Has video</dt>
          <dd>{{ media.hasVideo ? 'Yes' : 'No' }}</dd>
        </template>
        <template v-if="media.hasAudio != null">
          <dt>Has audio</dt>
          <dd>{{ media.hasAudio ? 'Yes' : 'No' }}</dd>
        </template>
        <template v-if="media.hasImage != null">
          <dt>Has image</dt>
          <dd>{{ media.hasImage ? 'Yes' : 'No' }}</dd>
        </template>
        <template v-if="media.creators.length">
          <dt>Creators</dt>
          <dd>{{ media.creators.join(', ') }}</dd>
        </template>
        <template v-if="media.uploaders.length">
          <dt>Uploaders</dt>
          <dd>{{ media.uploaders.join(', ') }}</dd>
        </template>
        <template v-if="media.earliestUploadedAt">
          <dt>Uploaded at</dt>
          <dd>{{ media.earliestUploadedAt.toLocaleString() }} (<RelativeTime :date="media.earliestUploadedAt" />)</dd>
        </template>
        <template v-if="media.earliestCreatedAt">
          <dt>Created at</dt>
          <dd>{{ media.earliestCreatedAt.toLocaleString() }} (<RelativeTime :date="media.earliestCreatedAt" />)</dd>
        </template>
        <dt>First indexed</dt>
        <dd>{{ media.firstIndexedAt.toLocaleString() }} (<RelativeTime :date="media.firstIndexedAt" />)</dd>
        <dt>Updated</dt>
        <dd>{{ media.updatedAt.toLocaleString() }} (<RelativeTime :date="media.updatedAt" />)</dd>
      </dl>

      <!-- Tags -->
      <div
        v-if="media.tags.length"
        class="tags-section"
        data-testid="media-info-tags"
      >
        <span
          v-for="tag in media.tags"
          :key="tag"
          class="tag"
        >{{ tag }}</span>
      </div>

      <!-- Debug: raw cache media -->
      <Fieldset
        v-if="uiState.debugMode"
        legend="Raw Cache Media"
        :toggleable="true"
        :collapsed="true"
        class="debug-raw-media"
      >
        <pre class="debug-json">{{ JSON.stringify(media, null, 2) }}</pre>
      </Fieldset>

      <!-- Per-source details -->
      <section
        v-for="src in media.sourceDetails"
        :key="src.sourceName"
        class="info-section"
      >
        <h3 class="section-heading">
          Source — {{ src.sourceName }}
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
          <template v-if="src.dislikes != null">
            <dt>Dislikes</dt>
            <dd>{{ src.dislikes.toLocaleString() }}</dd>
          </template>
          <template v-if="src.uploader">
            <dt>Uploader</dt>
            <dd>{{ src.uploader }}</dd>
          </template>
          <template v-if="src.uploadedAt">
            <dt>Uploaded at</dt>
            <dd>{{ src.uploadedAt.toLocaleString() }} (<RelativeTime :date="src.uploadedAt" />)</dd>
          </template>
          <template v-if="src.description">
            <dt>Description</dt>
            <dd>{{ src.description }}</dd>
          </template>
          <dt>Liase source</dt>
          <dd>{{ src.liaseSourceId }}</dd>
          <dt>Liase media ID</dt>
          <dd>{{ src.liaseMediaId }}</dd>
        </dl>
        <template v-if="uiState.debugMode">
          <Fieldset
            v-for="(rawMedia, i) in debugDataBySource.get(src.sourceName)"
            :key="i"
            legend="Raw Liase Media"
            :toggleable="true"
            :collapsed="true"
            class="debug-raw-media"
          >
            <pre class="debug-json">{{ JSON.stringify(rawMedia, null, 2) }}</pre>
          </Fieldset>
        </template>
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
          <template v-if="file.duration != null">
            <dt>Duration</dt>
            <dd>{{ formatDuration(file.duration) }}</dd>
          </template>
          <template v-if="file.hasVideo != null">
            <dt>Has video</dt>
            <dd>{{ file.hasVideo ? 'Yes' : 'No' }}</dd>
          </template>
          <template v-if="file.hasAudio != null">
            <dt>Has audio</dt>
            <dd>{{ file.hasAudio ? 'Yes' : 'No' }}</dd>
          </template>
          <template v-if="file.hasImage != null">
            <dt>Has image</dt>
            <dd>{{ file.hasImage ? 'Yes' : 'No' }}</dd>
          </template>
          <template v-if="file.mimeType">
            <dt>MIME type</dt>
            <dd>{{ file.mimeType }}</dd>
          </template>
          <template v-if="file.urlExpires">
            <dt>URL expires</dt>
            <dd>{{ file.urlExpires.toLocaleString() }} (<RelativeTime :date="file.urlExpires" />)</dd>
          </template>
          <dt>URL updated</dt>
          <dd>{{ file.urlUpdatedAt.toLocaleString() }} (<RelativeTime :date="file.urlUpdatedAt" />)</dd>
          <dt>Liase source</dt>
          <dd>{{ file.liaseSourceId }}</dd>
          <dt>Liase media ID</dt>
          <dd>{{ file.liaseMediaId }}</dd>
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
import { useUiState } from "@@/stores/ui";
import type { APIMediaData } from "@@/types/api-media";

const props = defineProps<{
  media: APIMediaData | null;
}>();

const uiState = useUiState();

type DebugEntry = { liaseId: string; mergedMedia: unknown };
const debugData = ref<DebugEntry[] | null>(null);

watch(
  [() => uiState.debugMode, () => props.media?.id],
  async ([debugMode, mediaId]) => {
    if (!debugMode || mediaId == null) {
      debugData.value = null;
      return;
    }
    debugData.value = await $fetch<DebugEntry[]>(
      "/api/admin/debug/liase-media",
      {
        query: { cacheMediaId: mediaId },
      },
    );
  },
  { immediate: true },
);

const debugDataBySource = computed(() => {
  const map = new Map<string, unknown[]>();
  if (!debugData.value) return map;
  for (const entry of debugData.value) {
    if (!entry.mergedMedia) continue;
    const sourceName = entry.liaseId.split("\t")[0];
    if (!sourceName) continue;
    const existing = map.get(sourceName) ?? [];
    existing.push(entry.mergedMedia);
    map.set(sourceName, existing);
  }
  return map;
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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

.debug-raw-media {
  margin-top: 10px;

  :deep(&:has(.p-fieldset-legend button[aria-expanded="false"])) {
    border-color: transparent;
    padding-bottom: 0;
  }

  &:deep(.p-fieldset-legend) {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #f59e0b;
  }
}

.debug-json {
  font-size: 0.75rem;
  background: rgb(0 0 0 / 40%);
  border: 1px solid rgb(245 158 11 / 30%);
  border-radius: 4px;
  padding: 8px;
  overflow-x: auto;
  white-space: pre;
  margin: 0;
  text-wrap: wrap;
}
</style>
