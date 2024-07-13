export default {
  extends: [
    'stylelint-config-standard',
    'stylelint-config-recommended-vue',
  ],
  rules: {
    'property-no-unknown': [
      true,
      {
        ignoreProperties: ['field-sizing'], // Not supported by stylelint at the time of writing
      },
    ],
  },
}
