<script setup lang="ts">
import { useUiState } from "@@/stores/ui";
import type { MenuItem } from "primevue/menuitem";

const props = defineProps<{
  breadcrumbs?: string[] | MenuItem[];
}>();

const items = ref([
  {
    label: "Media",
    route: "/media",
  },
  {
    label: "Groups",
    items: [
      {
        label: "Tags",
      },
    ],
    route: "/groups",
  },
  {
    label: "Settings",
    route: "/admin",
  },
]);

const route = useRoute();

function isNavItemActive(item: MenuItem) {
  if (!item.route) return false;
  return route.path === item.route || route.path.startsWith(`${item.route}/`);
}

const uiState = useUiState();

const breadcrumbItems = computed<MenuItem[]>(() => {
  let items: MenuItem[] = [];
  if (
    props.breadcrumbs?.every((breadcrumb) => typeof breadcrumb === "string")
  ) {
    items = props.breadcrumbs.map((label) => ({
      label,
    }));
    const pathSegments = route.path.replace(/(?:^\/+)|(?:\/+$)/, "").split("/");
    if (pathSegments.length === items.length) {
      pathSegments.forEach((_, i) => {
        const item = items[i];
        if (item) {
          item.route = `/${pathSegments.slice(0, i + 1).join("/")}`;
        }
      });
    }
    const lastBreadcrumb = items.at(-1);
    if (lastBreadcrumb) {
      lastBreadcrumb.visible = false;
    }
  } else if (
    props.breadcrumbs?.every((breadcrumb) => typeof breadcrumb === "object")
  ) {
    items = props.breadcrumbs;
  }
  return items;
});
</script>

<template>
  <div class="site-header">
    <div class="site-nav">
      <Menubar :model="items" breakpoint="480px">
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
              :class="{ 'nav-item-active': isNavItemActive(item) }"
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
      <div class="header-center">
        <slot name="center" />
      </div>
      <div class="right-side">
        <ExecutionIndicator />
        <button
          v-if="uiState.debugMode"
          @click="uiState.mediaBlurred = !uiState.mediaBlurred"
        >
          {{ uiState.mediaBlurred ? 'Unblur' : 'Blur' }}
        </button>
        <button @click="uiState.debugMode = !uiState.debugMode">
          Debug
        </button>
        <slot name="header-buttons" />
      </div>
    </div>
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
  .site-header {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    background: var(--p-content-background-opaque);

    .site-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5em 1em;
      gap: 1em;
      padding-top: calc(0.5em + env(safe-area-inset-top));

      .p-menubar {
        border: none;
        padding: 0;

        & :deep(.p-menubar-root-list) {
          font-size: 1em;
          width: auto;
        }

        & :deep(.p-menubar-item-content):hover {
          background-color: transparent;
        }

        & :deep(.nav-item-active) {
          color: var(--p-primary-color);
          font-weight: 600;
        }
      }

      > * {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5em;
      }

      .header-center {
        flex: 1;
        display: flex;
        justify-content: center;
      }

    }

    .p-breadcrumb {
      padding: 0;
    }

    .p-breadcrumb, h1 {
      margin: 0 1rem;
    }
  }

  /* Shrink nav link text before collapsing to hamburger */
  @media (max-width: 680px) {
    .site-nav .p-menubar :deep(.p-menubar-root-list) {
      font-size: 0.875em;
    }
  }
</style>
