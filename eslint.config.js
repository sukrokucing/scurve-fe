import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/components/ui/dialog',
              importNames: ['DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription'],
              message: 'Use AppDialogContent to enforce dialog title/description structure.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: [
            "JSXElement[openingElement.name.name='button'] JSXElement[openingElement.name.name='button']",
            "JSXElement[openingElement.name.name='button'] JSXElement[openingElement.name.name='Button']",
            "JSXElement[openingElement.name.name='button'] JSXElement[openingElement.name.name='a']",
            "JSXElement[openingElement.name.name='button'] JSXElement[openingElement.name.name='input']",
            "JSXElement[openingElement.name.name='button'] JSXElement[openingElement.name.name='select']",
            "JSXElement[openingElement.name.name='button'] JSXElement[openingElement.name.name='textarea']",
            "JSXElement[openingElement.name.name='Button'] JSXElement[openingElement.name.name='button']",
            "JSXElement[openingElement.name.name='Button'] JSXElement[openingElement.name.name='Button']",
            "JSXElement[openingElement.name.name='Button'] JSXElement[openingElement.name.name='a']",
            "JSXElement[openingElement.name.name='Button'] JSXElement[openingElement.name.name='input']",
            "JSXElement[openingElement.name.name='Button'] JSXElement[openingElement.name.name='select']",
            "JSXElement[openingElement.name.name='Button'] JSXElement[openingElement.name.name='textarea']",
          ].join(', '),
          message: 'Avoid nesting interactive elements (button/link/form controls) inside button-like containers.',
        },
      ],
    },
  },
  {
    files: ['src/components/ui/app-dialog-content.tsx'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
])
