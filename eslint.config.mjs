import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import prettierPlugin from 'eslint-plugin-prettier';
import unicornPlugin from 'eslint-plugin-unicorn';
import nxPlugin from '@nx/eslint-plugin';

const tsFiles = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];
const tsStrict = tseslint.configs.strictTypeChecked ?? { rules: {} };
const tsStylistic = tseslint.configs.stylisticTypeChecked ?? { rules: {} };
const importRecommended = importPlugin.configs.recommended ?? { rules: {} };
const importTypescript = importPlugin.configs.typescript ?? { rules: {} };
const jsdocRecommended = jsdocPlugin.configs['flat/recommended'] ?? { rules: {} };
const unicornRecommended = unicornPlugin.configs.recommended ?? { rules: {} };

const packageTsFiles = (pkg) =>
  tsFiles.map((pattern) => pattern.replace('**/', `packages/${pkg}/**/`));

const moduleBoundaryRule = [
  'error',
  {
    enforceBuildableLibDependency: true,
    allow: ['../../vitest.config.base', '../../vitest.config.base.ts'],
    depConstraints: [
      {
        sourceTag: 'type:application',
        onlyDependOnLibsWithTags: ['type:library'],
      },
      {
        sourceTag: 'scope:cli',
        onlyDependOnLibsWithTags: [
          'scope:core',
          'scope:build',
          'scope:diff',
          'scope:lint',
          'scope:audit',
          'scope:extractors',
        ],
      },
      {
        sourceTag: 'scope:build',
        onlyDependOnLibsWithTags: ['scope:core'],
      },
      {
        sourceTag: 'scope:audit',
        onlyDependOnLibsWithTags: ['scope:core'],
      },
      {
        sourceTag: 'scope:diff',
        onlyDependOnLibsWithTags: ['scope:core'],
      },
      {
        sourceTag: 'scope:lint',
        onlyDependOnLibsWithTags: ['scope:core'],
      },
      {
        sourceTag: 'scope:inspect',
        onlyDependOnLibsWithTags: ['scope:core'],
      },
      {
        sourceTag: 'scope:extractors',
        onlyDependOnLibsWithTags: ['scope:core'],
      },
      {
        sourceTag: 'scope:core',
        onlyDependOnLibsWithTags: ['scope:core'],
      },
    ],
  },
];

export default [
  {
    ignores: ['**/dist/**', '**/coverage/**', 'eslint.config.mjs', 'commitlint.config.mjs'],
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    settings: {
      jsdoc: {
        mode: 'typescript',
      },
    },
    ...js.configs.recommended,
    languageOptions: {
      sourceType: 'module',
    },
    plugins: {
      '@nx': nxPlugin,
      import: importPlugin,
      jsdoc: jsdocPlugin,
      prettier: prettierPlugin,
      unicorn: unicornPlugin,
    },
    rules: {
      ...importRecommended.rules,
      ...jsdocRecommended.rules,
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
        },
      ],
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns-type': 'off',
      'jsdoc/require-throws-type': 'off',
      'jsdoc/tag-lines': 'off',
      ...unicornRecommended.rules,
      '@nx/enforce-module-boundaries': moduleBoundaryRule,
      'prettier/prettier': 'error',
      'import/no-default-export': 'error',
      'unicorn/prevent-abbreviations': 'off',
    },
  },
  {
    files: tsFiles,
    settings: {
      jsdoc: {
        mode: 'typescript',
      },
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@nx': nxPlugin,
      '@typescript-eslint': tseslint,
      import: importPlugin,
      jsdoc: jsdocPlugin,
      prettier: prettierPlugin,
      unicorn: unicornPlugin,
    },
    rules: {
      ...tsStrict.rules,
      ...tsStylistic.rules,
      ...importTypescript.rules,
      ...jsdocRecommended.rules,
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
        },
      ],
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns-type': 'off',
      'jsdoc/require-throws-type': 'off',
      'jsdoc/tag-lines': 'off',
      ...unicornRecommended.rules,
      '@nx/enforce-module-boundaries': moduleBoundaryRule,
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      'import/no-default-export': 'error',
      'prettier/prettier': 'error',
      'unicorn/prevent-abbreviations': 'off',
    },
  },
  {
    files: packageTsFiles('build'),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@dtifx/audit', '@dtifx/audit/**', '@dtifx/diff', '@dtifx/diff/**'],
        },
      ],
    },
  },
  {
    files: packageTsFiles('audit'),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@dtifx/build', '@dtifx/build/**', '@dtifx/diff', '@dtifx/diff/**'],
        },
      ],
    },
  },
  {
    files: packageTsFiles('diff'),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['@dtifx/build', '@dtifx/build/**', '@dtifx/audit', '@dtifx/audit/**'],
        },
      ],
    },
  },
  {
    files: ['**/vitest.config.ts', 'vitest.config.base.ts'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
];
