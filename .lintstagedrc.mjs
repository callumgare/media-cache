export default {
  '**/*': ['eslint --fix --no-warn-ignored'],
  '**/*.{vue,css,scss}': 'stylelint --fix',
  // nuxt typecheck doesn't accept file arguments — run it over the whole project
  // regardless of which files are staged by using a function that ignores the list.
  '**/*.{vue,ts}': () => 'npm run typecheck',
}
