/**
 * pinia-persist-extended
 *
 * Extends pinia-plugin-persistedstate with SSR-safe deferred storage for
 * localStorage and sessionStorage. The goal is to let app code read persisted
 * state from any storage backend without worrying about hydration conflicts:
 * values may not reflect what is saved until loading has finished, but they
 * will always be consistent (no SSR/client mismatch warnings).
 *
 * Usage: add a `persistExtended` option to any defineStore call, structured
 * the same way as pinia-plugin-persistedstate's `persist` option but using
 * `keyStorage` to route each state key to the right backend. Call `loadingFor`
 * in state() to get the matching initial loading flags.
 */
import {
  addPlugin,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from "@nuxt/kit";

export interface ModuleOptions {
  addLoadingProperty?: boolean;
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: "pinia-persist-extended",
  },
  defaults: {
    addLoadingProperty: false,
  },
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url);

    // Virtual options module — lets the runtime plugin read build-time flags
    // without needing runtimeConfig or hardcoded values.
    const optionsTemplate = addTemplate({
      filename: "pinia-persist-extended-options.mjs",
      getContents: () =>
        `export const ADD_LOADING_PROPERTY = ${Boolean(options.addLoadingProperty)};\n`,
      write: true,
    });
    nuxt.options.alias["#pinia-persist-extended-options"] = optionsTemplate.dst;

    // Companion .d.ts so TypeScript can resolve the paths alias to actual types.
    addTemplate({
      filename: "pinia-persist-extended-options.d.ts",
      getContents: () => "export const ADD_LOADING_PROPERTY: boolean;\n",
      write: true,
    });

    // Generates type declarations: the virtual module type plus the optional
    // PiniaCustomProperties.loading augmentation when addLoadingProperty is on.
    addTypeTemplate({
      filename: "types/pinia-persist-extended.d.ts",
      getContents: () =>
        [
          `declare module '#pinia-persist-extended-options' {`,
          "  export const ADD_LOADING_PROPERTY: boolean;",
          "}",
          options.addLoadingProperty
            ? [
                `declare module 'pinia' {`,
                "  export interface PiniaCustomProperties {",
                "    loading: Record<string, boolean>;",
                "  }",
                "}",
              ].join("\n")
            : "",
          "export {};",
          "",
        ]
          .filter((line) => line !== "")
          .join("\n"),
    });

    addPlugin({ src: resolve("./runtime/plugin") });
  },
});
