<template>
  <div class="log-list">
    <div class="log-list-header">
      Logs ({{ logs.length }})
    </div>
    <div class="log-entries">
      <div
        v-for="log in logs"
        :key="log.id"
        :class="['log-entry', log.level]"
      >
        <span class="log-level">{{ levelLabel(log.level) }}</span>
        <pre class="log-message">{{ log.message }}</pre>
        <span class="log-time">{{ formatTime(log.createdAt) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { dbSchema } from "#build/types/nitro-imports";

const { logs } = defineProps<{
  logs: QueryExecutionTask["logs"];
}>();

function levelLabel(level: dbSchema.LogLevel): string {
  return (
    {
      debug: "DEBUG",
      info: "INFO",
      warning: "WARN",
      error: "ERROR",
      "fatal-error": "FATAL",
    }[level] ?? level.toUpperCase()
  );
}

function formatTime(date: Date): string {
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}
</script>

<style scoped>
  .log-list {
    margin-top: 0.5rem;
    border: 1px solid var(--p-surface-200);
    border-radius: 0.4rem;
    overflow: hidden;
  }

  .log-list-header {
    background: var(--p-surface-100);
    padding: 0.3rem 0.75rem;
    font-size: 0.8em;
    font-weight: 600;
    color: var(--p-text-muted-color);
  }

  .log-entries {
    max-height: 200px;
    overflow-y: auto;
    font-family: monospace;
    font-size: 0.82em;
  }

  .log-entry {
    display: grid;
    grid-template-columns: 3.5rem 1fr auto;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    border-bottom: 1px solid var(--p-surface-100);

    &:last-child {
      border-bottom: none;
    }
    
    &.debug {
      background: color-mix(in srgb, var(--p-blue-100) 40%, transparent);
    }
    
    &.info {
      background: color-mix(in srgb, var(--p-green-100) 40%, transparent);
    }

    &.warning {
      background: color-mix(in srgb, var(--p-yellow-100) 40%, transparent);
    }

    &.error {
      background: color-mix(in srgb, var(--p-orange-100) 40%, transparent);
    }

    &.fatal-error {
      background: color-mix(in srgb, var(--p-red-100) 40%, transparent);
    }
  }

  .log-level {
    font-weight: 700;

    .warning & { color: var(--p-yellow-700); }

    /* stylelint-disable-next-line selector-class-pattern */
    .non_fatal_error & { color: var(--p-orange-700); }

    /* stylelint-disable-next-line selector-class-pattern */
    .fatal_error & { color: var(--p-red-700); }
  }
  
  .log-message {
    text-wrap: auto;
  }

  .log-time {
    color: var(--p-text-muted-color);
    white-space: nowrap;
  }
</style>
