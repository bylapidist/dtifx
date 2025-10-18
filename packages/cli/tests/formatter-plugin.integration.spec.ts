import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliProjectRoot = path.resolve(__dirname, '..');

describe('dtifx CLI formatter plugins', () => {
  test('executes external formatter plugins declared in configuration', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'dtifx-cli-formatters-'));

    try {
      const pluginSource = path.resolve(
        __dirname,
        'fixtures',
        'formatters',
        'formatter-plugin.mjs',
      );
      const pluginTarget = path.join(workspace, 'formatter-plugin.mjs');
      await cp(pluginSource, pluginTarget);

      const configPath = path.join(workspace, 'dtifx.config.mjs');
      await writeFile(
        configPath,
        `import { defineConfig, pointerTemplate } from '@dtifx/build';

export default defineConfig({
  layers: [{ name: 'base' }],
  sources: [
    {
      kind: 'virtual',
      id: 'virtual-tokens',
      layer: 'base',
      pointerTemplate: pointerTemplate('tokens'),
      document: () => ({
        tokens: {
          greeting: {
            $type: 'cursor',
            $value: { cursorType: 'css.cursor', value: 'pointer' },
          },
        },
      }),
    },
  ],
  formatters: {
    entries: [
      {
        name: 'fixture.uppercase',
        options: { prefix: 'CLI:' },
        output: {},
      },
    ],
    plugins: [
      {
        module: './formatter-plugin.mjs',
        options: { fileName: 'cli-format.txt' },
      },
    ],
  },
});
`,
        'utf8',
      );

      const outDir = 'artifacts';
      await execFileAsync(
        'pnpm',
        [
          'exec',
          'tsx',
          path.resolve(cliProjectRoot, 'src', 'bin.ts'),
          'build',
          'generate',
          '--config',
          configPath,
          '--out-dir',
          outDir,
          '--json-logs',
        ],
        {
          cwd: workspace,
          env: process.env,
          maxBuffer: 5 * 1024 * 1024,
        },
      );

      const outputPath = path.join(workspace, outDir, 'cli-format.txt');
      const contents = await readFile(outputPath, 'utf8');
      expect(contents.trim()).toBe('CLI:POINTER');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});
