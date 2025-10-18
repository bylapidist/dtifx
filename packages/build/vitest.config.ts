import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config.base';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default mergeConfig(
  baseConfig,
  defineConfig({
    root: __dirname,
    resolve: {
      alias: {
        chokidar: path.resolve(__dirname, 'test/mocks/chokidar.ts'),
      },
    },
    test: {
      name: 'build',
      coverage: {
        reportsDirectory: path.resolve(__dirname, 'coverage'),
      },
    },
  }),
);
