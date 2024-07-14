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

const breadcrumbItems = ref<MenuItem[]>([])

if (props.breadcrumbs?.every(breadcrumb => typeof breadcrumb === 'string')) {
  breadcrumbItems.value = props.breadcrumbs.map(label => ({
    label,
  }))
  const pathSegments = route.path.replace(/(?:^\/+)|(?:\/+$)/, '').split('/')
  if (pathSegments.length === breadcrumbItems.value.length) {
    for (let i = 0; i < pathSegments.length; i++) {
      const path = '/' + pathSegments.slice(0, i + 1).join('/')
      breadcrumbItems.value[i].route = path
    }
  }
  const lastBreadcrumb = breadcrumbItems.value.at(-1)
  if (lastBreadcrumb) {
    lastBreadcrumb.visible = false
  }
}
else if (props.breadcrumbs?.every(breadcrumb => typeof breadcrumb === 'object')) {
  breadcrumbItems.value = props.breadcrumbs
}
</script>

<template>
  <div class="root">
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
            <span :class="item.icon" />
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
          <span :class="item.icon" />
          <span class="ml-2">{{ item.label }}</span>
          <span
            v-if="hasSubmenu"
            class="pi pi-fw pi-angle-down ml-2"
          />
        </a>
      </template>
    </Menubar>
    <hr>
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
</template>

<style scoped>
  .root {
    margin-bottom: 2em;

    .p-menubar {
      border: none;
      margin: 0 -0.9em 0.5em;
      padding: 0;

      & :deep(.p-menubar-root-list) {
        font-size: 1.3em;
      }

      & :deep(.p-menubar-item-content):hover {
        background-color: transparent;
      }
    }

    hr {
      margin: 0 -1em 1em;
    }

    .p-breadcrumb {
      padding: 0;
    }
  }
</style>
