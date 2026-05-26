import Aura from "@primevue/themes/aura";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // Allow per-worker override during e2e testing to avoid cache conflicts
  // between parallel nuxt dev instances.
  buildDir: process.env.NUXT_BUILD_DIR ?? ".nuxt",
  nitro: {
    output: {
      dir: process.env.NITRO_OUTPUT_DIR,
    },
  },
  css: ["@videojs/html/video/minimal-skin.css"],
  modules: [
    "@primevue/nuxt-module",
    "@peterbud/nuxt-query",
    "@pinia/nuxt",
    "pinia-plugin-persistedstate/nuxt",
    ["./modules/pinia-persist-extended", { addLoadingProperty: true }],
    "nuxt-drizzle-migrations",
    "nuxt-superjson",
  ],
  devtools: { enabled: true },
  compatibilityDate: "2024-04-03",
  vite: {
    server: {
      warmup: {
        clientFiles: ["./app/**/*.vue", "./app/**/*.ts"],
      },
    },
    optimizeDeps: {
      include: [
        "@vue/devtools-core",
        "@vue/devtools-kit",
        "@vueuse/core",
        "@tanstack/vue-query",
        "photoswipe/lightbox",
        "photoswipe",
        "@vueuse/gesture",
        "@vueuse/motion",
        "superjson",
        "@videojs/html/video/player",
        "@videojs/html/video/minimal-skin",
        "@videojs/html/media/hls-video",
        "@videojs/html/media/dash-video",
        "@tanstack/vue-virtual",
        "lucide-vue-next",
        "@panzoom/panzoom",
      ],
    },
  },
  nuxtQuery: {
    autoImports: ["useQuery", "useInfiniteQuery"],
  },
  primevue: {
    components: {
      include: [
        "Breadcrumb",
        "Button",
        "Checkbox",
        "Column",
        "ConfirmDialog",
        "DataTable",
        "Dialog",
        "Fieldset",
        "Inplace",
        "InputGroup",
        "InputGroupAddon",
        "InputNumber",
        "InputText",
        "Menubar",
        "MultiSelect",
        "Popover",
        "ProgressBar",
        "ProgressSpinner",
        "Select",
        "SelectButton",
        "Skeleton",
        "Textarea",
        "Toast",
      ],
    },
    options: {
      theme: {
        preset: Aura,
      },
    },
  },
  app: {
    head: {
      viewport:
        "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
      meta: [
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        {
          name: "apple-mobile-web-app-status-bar-style",
          content: "black-translucent",
        },
        { name: "apple-mobile-web-app-title", content: "Media Cache" },
      ],
    },
  },
  vue: {
    compilerOptions: {
      isCustomElement: (tag) =>
        tag.startsWith("media-") ||
        tag.startsWith("video-") ||
        tag.startsWith("audio-"),
    },
  },
});
