// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  modules: [
    '@nuxt/eslint',
    'nuxt-primevue',
    '@prisma/nuxt',
    '@hebilicious/vue-query-nuxt',
  ],
  eslint: {
    config: {
      stylistic: true,
    },
  },
  vue: {
    compilerOptions: {
      isCustomElement: tag => ['mux-player'].includes(tag),
    },
  },
})
