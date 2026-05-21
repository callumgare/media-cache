<template>
  <NuxtLayout name="base">
    <div class="admin-layout">
      <nav class="admin-nav">
        <NuxtLink
          to="/admin/queries"
          class="nav-item"
          active-class="nav-item--active"
        >
          Queries
        </NuxtLink>
        <NuxtLink
          to="/admin/secrets"
          class="nav-item"
          active-class="nav-item--active"
        >
          Query Secrets
        </NuxtLink>
        <NuxtLink
          to="/admin/plugins"
          class="nav-item"
          active-class="nav-item--active"
        >
          Query Plugins
        </NuxtLink>
        <NuxtLink
          v-if="uiState.debugMode"
          to="/admin/debug"
          class="nav-item"
          active-class="nav-item--active"
        >
          Debug
        </NuxtLink>
      </nav>
      <div class="admin-content">
        <slot />
      </div>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { useUiState } from "~~/stores/ui";

const uiState = useUiState();
</script>

<style scoped>
  .admin-layout {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    overflow: hidden;
    --border: 1px solid light-dark(var(--p-zinc-200), var(--p-zinc-700));


    .admin-nav {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      border-bottom: var(--border);
      background: var(--primary-background);
      flex-shrink: 0;
      padding: 0 1rem;
    }

    .nav-item {
      flex: 1 1 auto;
      padding: 0.75em .5em;
      text-decoration: none;
      color: inherit;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      text-align: center;
      font-size: clamp(0.8rem, 2.5vw, 1rem);

      &:hover {
        background: light-dark(var(--p-zinc-200), var(--p-zinc-700));
      }

      &.nav-item--active {
        color: var(--p-primary-color);
        border-bottom-color: var(--p-primary-color);
        font-weight: 600;
      }
    }

    .admin-content {
      flex: 1 1 auto;
      overflow: auto;
      padding: 1em;
    }

    @media (min-width: 640px) {
      & {
        flex-direction: row;
        /* border-top: var(--border); */
      }

      .admin-nav {
        flex-direction: column;
        flex-wrap: nowrap;
        border-bottom: none;
        border-right: var(--border);
        min-width: 150px;
        flex-shrink: 0;
        overflow-y: auto;
        padding: 0;
      }

      .nav-item {
        flex: none;
        text-align: unset;
        font-size: unset;
        border-bottom: none;
        border-left: 3px solid transparent;
        margin-bottom: 0;
        margin-left: -1px;

        &.nav-item--active {
          border-bottom-color: transparent;
          border-left-color: var(--p-primary-color);
        }
      }
    }
  }

</style>
