/* eslint-disable @nx/enforce-module-boundaries */
/* eslint-disable import/no-default-export */
import { defineConfig, placeholder, pointerTemplate } from '@dtifx/build';

export default defineConfig({
  layers: [{ name: 'foundation' }, { name: 'product' }],
  sources: [
    {
      id: 'tokens.library',
      layer: 'foundation',
      kind: 'file',
      pointerTemplate: pointerTemplate('tokens', placeholder('stem')),
      patterns: ['tokens/**/*.json'],
    },
  ],
  formatters: [
    {
      name: 'json.snapshot',
      output: { directory: 'dist/snapshots' },
    },
    {
      name: 'css.variables',
      options: { filename: 'tokens.css' },
      output: { directory: 'dist/css' },
    },
  ],
  audit: {
    policies: [
      {
        name: 'governance.requireOwner',
        options: { severity: 'error' },
      },
    ],
  },
});
