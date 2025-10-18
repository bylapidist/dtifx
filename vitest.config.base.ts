import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    passWithNoTests: true,
    environment: 'node',
    globals: true,
    include: ['{src,tests}/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/dist/**', '**/coverage/**'],
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    env: {
      PNPM_WORKSPACE_DIR: repoRoot,
      NODE_PATH: path.join(repoRoot, 'node_modules'),
    },
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      exclude: [
        '**/dist/**',
        '**/coverage/**',
        '**/scripts/**',
        '**/*.d.ts',
        '**/test{,s}/**/*.ts',
      ],
    },
  },
});
