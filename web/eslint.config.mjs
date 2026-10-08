// Конфиг генерируется модулем @nuxt/eslint при `nuxt prepare`.
import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt({
  rules: {
    'vue/multi-word-component-names': 'off',
  },
  ignores: ['.nuxt/**', '.output/**', 'node_modules/**', 'dist/**'],
});
