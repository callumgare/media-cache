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
        "hls.js",
        "@vueuse/gesture",
        "@vueuse/motion",
        "superjson",
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
  vue: {
    compilerOptions: {
      isCustomElement: (tag) =>
        tag.startsWith("media-") ||
        tag.startsWith("video-") ||
        tag.startsWith("audio-"),
    },
  },
});
