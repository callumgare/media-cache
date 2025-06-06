<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem'

const props = defineProps<{
  breadcrumbs?: string[] | MenuItem[]
}>()

const items = ref([
  {
    label: 'Media',
    route: '/',
  },
  {
    label: 'Groups',
    items: [
      {
        label: 'Tags',
      },
    ],
    route: '/',
  },
  {
    label: 'Settings',
    route: '/admin',
  },
])

const route = useRoute()

const uiState = useUiState()

const breadcrumbItems = computed<MenuItem[]>(() => {
  let items: MenuItem[] = []
  if (props.breadcrumbs?.every(breadcrumb => typeof breadcrumb === 'string')) {
    items = props.breadcrumbs.map(label => ({
      label,
    }))
    const pathSegments = route.path.replace(/(?:^\/+)|(?:\/+$)/, '').split('/')
    if (pathSegments.length === items.length) {
      for (let i = 0; i < pathSegments.length; i++) {
        const path = '/' + pathSegments.slice(0, i + 1).join('/')
        items[i].route = path
      }
    }
    const lastBreadcrumb = items.at(-1)
    if (lastBreadcrumb) {
      lastBreadcrumb.visible = false
    }
  }
  else if (props.breadcrumbs?.every(breadcrumb => typeof breadcrumb === 'object')) {
    items = props.breadcrumbs
  }
  return items
})
</script>

<template>
  <div class="root">
    <div class="site-nav">
      <Menubar :model="items">
        <template #item="{ item, props: itemProps, hasSubmenu }">
          <NuxtLink
            v-if="item.route"
            v-slot="{ href, navigate }"
            :to="item.route"
            custom
          >
            <a
              v-ripple
              :href="href"
              v-bind="itemProps.action"
              @click="navigate"
            >
              <span
                v-if="item.icon"
                :class="item.icon"
              />
              <span class="ml-2">{{ item.label }}</span>
            </a>
          </NuxtLink>
          <a
            v-else
            v-ripple
            :href="item.url"
            :target="item.target"
            v-bind="itemProps.action"
          >
            <span
              v-if="item.icon"
              :class="item.icon"
            />
            <span class="ml-2">{{ item.label }}</span>
            <span
              v-if="hasSubmenu"
              class="pi pi-fw pi-angle-down ml-2"
            />
          </a>
        </template>
      </Menubar>
      <div class="right-side">
        <button
          v-if="uiState.debugMode"
          @click="uiState.mediaBlurred = !uiState.mediaBlurred"
        >
          {{ uiState.mediaBlurred ? 'Unblur' : 'Blur' }}
        </button>
        <button @click="uiState.debugMode = !uiState.debugMode">
          Debug
        </button>
        <button @click="uiState.randomSeed = Math.floor(Math.random() * (100000 - 1))">
          Randomise{{ uiState.debugMode ? ` (seed: ${uiState.randomSeed})` : '' }}
        </button>
        <slot name="header-buttons" />
      </div>
    </div>
    <hr>
    <div
      v-if="breadcrumbItems.length"
      class="page-header"
    >
      <Breadcrumb
        v-if="breadcrumbItems.length > 1"
        :model="breadcrumbItems"
      >
        <template #item="{ item, props: itemProps }">
          <NuxtLink
            v-if="item.route"
            v-slot="{ href, navigate }"
            :to="item.route"
            custom
          >
            <a
              :href="href"
              v-bind="itemProps.action"
              @click="navigate"
            >
              <span
                v-if="item.icon"
                :class="[item.icon, 'text-color']"
              />
              <span class="text-primary font-semibold">{{ item.label }}</span>
            </a>
          </NuxtLink>
          <a
            v-else
            :href="item.url"
            :target="item.target"
            v-bind="itemProps.action"
          >
            <span class="text-surface-700 dark:text-surface-0">{{ item.label }}</span>
          </a>
        </template>
      </Breadcrumb>
      <h1 v-if="breadcrumbItems.at(-1)?.label">
        {{ breadcrumbItems.at(-1)?.label }}
      </h1>
    </div>
  </div>
</template>

<style scoped>
  .root {
    .site-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 0.5em 1em;
      gap: 1em;

      .p-menubar {
        border: none;
        padding: 0;

        & :deep(.p-menubar-root-list) {
          font-size: 1.3em;
          width: auto;
        }

        & :deep(.p-menubar-item-content):hover {
          background-color: transparent;
        }
      }

      > * {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5em;
      }
    }

    .p-breadcrumb {
      padding: 0;
    }

    .p-breadcrumb, h1 {
      margin: 0 1rem;
    }

    .page-header {
      margin: 1em 0 0;
    }
  }
</style>
