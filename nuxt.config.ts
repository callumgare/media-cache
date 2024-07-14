import Aura from '@primevue/themes/aura'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  modules: [
    '@nuxt/eslint',
    '@primevue/nuxt-module',
    '@hebilicious/vue-query-nuxt',
  ],
  eslint: {
    config: {
      stylistic: true,
    },
  },
  vue: {
    compilerOptions: {
      isCustomElement: (tag: string) => ['mux-player'].includes(tag),
    },
  },
  primevue: {
    options: {
      theme: {
        preset: Aura,
      },
    },
  },
})
