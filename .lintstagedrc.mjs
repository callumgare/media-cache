export default {
	"**/*.{css,js,ts,mjs,mts,vue,json}": "biome check --fix",
	// nuxt typecheck doesn't accept file arguments — run it over the whole project
	// regardless of which files are staged by using a function that ignores the list.
	"**/*.{vue,ts}": () => "npm run typecheck",
};
