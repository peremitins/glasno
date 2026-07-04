// @ts-check
// Базовый конфиг генерируется модулем @nuxt/eslint (nuxt prepare) с учётом
// структуры проекта. Свои правила добавляются аргументами withNuxt(...).
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      // В кодовой базе ~60 осознанных any (внешние SDK, event-пейлоады).
      // Понижено до warn, чтобы не блокировать lint; чистим постепенно.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Лендинг — отдельное Nuxt-приложение: его pages/ корневой модуль
    // не распознаёт как страницы, поэтому исключение здесь вручную.
    files: ['apps/landing/pages/**'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  }
)
