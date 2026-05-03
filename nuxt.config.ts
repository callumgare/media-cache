import Aura from '@primevue/themes/aura'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@primevue/nuxt-module',
    '@peterbud/nuxt-query',
    '@pinia/nuxt',
    'pinia-plugin-persistedstate/nuxt',
  ],
  devtools: { enabled: true },
  compatibilityDate: '2024-04-03',
  vite: {
    optimizeDeps: {
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
        '@vueuse/core',
        '@tanstack/vue-query',
        'photoswipe/lightbox',
        'photoswipe',
        'hls.js',
        'photoswipe-video-plugin',
        '@vueuse/gesture',
        '@vueuse/motion',
      ],
    },
  },
  eslint: {
    config: {
      stylistic: true,
    },
  },
  nuxtQuery: {
    autoImports: ['useQuery', 'useInfiniteQuery'],
  },
  primevue: {
    options: {
      theme: {
        preset: Aura,
      },
    },
  },
})
