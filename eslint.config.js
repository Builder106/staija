import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue', '**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        extraFileExtensions: ['.vue'],
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-unused-vars': 'warn',
      'vue/no-v-html': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.vue'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.vue', 'functions/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-deprecated': 'error',
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.vue', 'functions/src/**/*.ts'],
    ignores: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.spec.ts',
      'src/**/*.spec.tsx',
      'src/**/__tests__/**',
      'src/tests/**',
      'functions/src/**/*.test.ts',
      'functions/src/**/*.spec.ts',
      'functions/src/**/__tests__/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSUnknownKeyword',
          message: 'Use a concrete type; keep unknown only at validated data or error boundaries.',
        },
      ],
    },
  },
  {
    // These files model external error, Contentful, and Lottie JSON boundaries.
    files: [
      'src/services/avatar/lotties.ts',
      'functions/src/quizContent.ts',
      'functions/src/contentful.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  prettier,
  {
    ignores: [
      'dist/',
      'node_modules/',
      '*.config.*',
      'scripts/',
      'tools/',
      'e2e/',
      'tests/',
      'trailer/',
      'functions/lib/',
      'functions/*.cjs',
      'functions/*.js',
      'take_screens.mjs',
      'mobile-audit.cjs',
      '.features-gen/',
      'coverage/',
      'docs/',
      'ui-demo/',
    ],
  }
)
