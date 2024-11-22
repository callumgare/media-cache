<template>
  <div id="app-root">
    <Toast />
    <SiteHeader :breadcrumbs="breadcrumbs">
      <template #header-buttons>
        <slot name="header-buttons" />
      </template>
    </SiteHeader>
    <div class="base-layout-contents">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const breadcrumbs = computed(() => {
  let { breadcrumbs } = route.meta
  if (typeof breadcrumbs === 'function') {
    breadcrumbs = breadcrumbs({ route })
  }
  return breadcrumbs
})
</script>

<style scoped>
  #app-root {
    max-height: 100vh;
    display: flex;
    flex-direction: column;

    .base-layout-contents {
      overflow: auto;
      display: flex;
      flex-direction: column;
      position: relative;
    }
  }
</style>

<style>
  @layer reset;

  /********************
  Custom
  ********************/
  body {
    font-family: sans-serif;
    background: var(--primary-background);
  }

  :root {
    --primary-background: light-dark(var(--p-zinc-100), var(--p-zinc-900));
    --bg-highlight: var(--p-yellow-100);

    @media (prefers-color-scheme: dark) {
      --bg-highlight: var(--p-yellow-700);
    }
  }

  @keyframes target-fade {
    0% { background-color: var(--bg-highlight); }
    100% { background-color: transparent; }
  }

  :target {
    animation: target-fade 3s 1;
  }

  .p-button {
    line-height: normal;
  }

  /********************
  CSS Reset
  Based on: https://www.joshwcomeau.com/css/custom-css-reset/
  ********************/
  @layer reset {
    /*
    1. Use a more-intuitive box-sizing model.
    */
    *, *::before, *::after {
      box-sizing: border-box;
    }

    /*
      2. Remove default margin
    */
    * {
      margin: 0;
    }

    /*
      Typographic tweaks!
      3. Add accessible line-height
      4. Improve text rendering
    */
    body {
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /*
      5. Improve media defaults
    */
    img, picture, video, canvas, svg {
      display: block;
      max-width: 100%;
    }

    /*
      6. Remove built-in form typography styles
    */
    input, button, textarea, select {
      font: inherit;
    }

    /*
      7. Avoid text overflows
    */
    p, h1, h2, h3, h4, h5, h6 {
      overflow-wrap: break-word;
    }

    /*
      8. Create a root stacking context
    */
    /* stylelint-disable-next-line selector-id-pattern -- #__nuxt is a third-party id */
    #app-root, #__nuxt {
      isolation: isolate;
    }
  }
</style>
