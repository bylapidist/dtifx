import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm, writeFile, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliProjectRoot = path.resolve(__dirname, '..');

const runCli = async (args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) => {
  return execFileAsync(
    'pnpm',
    ['exec', 'tsx', path.resolve(cliProjectRoot, 'src', 'bin.ts'), ...args],
    {
      cwd: options.cwd ?? cliProjectRoot,
      env: options.env ?? process.env,
      maxBuffer: 5 * 1024 * 1024,
    },
  );
};

describe('dtifx extract providers', () => {
  test('extracts Sketch tokens from the CLI', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'dtifx-cli-sketch-'));

    try {
      await writeFile(
        path.join(workspace, 'package.json'),
        JSON.stringify({ name: 'dtifx-cli-sketch', version: '0.0.0', type: 'module' }),
        'utf8',
      );

      const nodeModulesTarget = path.join(workspace, 'node_modules');
      await symlink(
        path.join(cliProjectRoot, 'node_modules'),
        nodeModulesTarget,
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      const fixtureSource = path.resolve(__dirname, 'fixtures', 'extract', 'sketch-document.json');
      const fixtureTarget = path.join(workspace, 'sketch.json');
      await cp(fixtureSource, fixtureTarget);

      const outputPath = path.join(workspace, 'tokens', 'sketch-output.json');

      await runCli(['extract', 'sketch', '--file', fixtureTarget, '--output', outputPath], {
        env: process.env,
      });

      const contents = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, any>;
      expect(contents.color?.surface?.background?.$value?.components).toEqual([0.1, 0.2, 0.3]);
      expect(contents.typography?.heading?.h1?.$value?.fontFamily).toBe('Inter');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 120_000);

  test('extracts Penpot tokens from the CLI', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'dtifx-cli-penpot-'));
    const server = createServer(async (request, response) => {
      if (request.method === 'GET' && request.url?.startsWith('/design/files/demo/styles')) {
        const payloadPath = path.resolve(__dirname, 'fixtures', 'extract', 'penpot-styles.json');
        const payload = await readFile(payloadPath, 'utf8');
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json');
        response.end(payload);
        return;
      }
      response.statusCode = 404;
      response.end();
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/`;

    try {
      await writeFile(
        path.join(workspace, 'package.json'),
        JSON.stringify({ name: 'dtifx-cli-penpot', version: '0.0.0', type: 'module' }),
        'utf8',
      );

      const nodeModulesTarget = path.join(workspace, 'node_modules');
      await symlink(
        path.join(cliProjectRoot, 'node_modules'),
        nodeModulesTarget,
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      const outputPath = path.join(workspace, 'tokens', 'penpot-output.json');

      await runCli(
        [
          'extract',
          'penpot',
          '--file',
          'demo',
          '--token',
          'test-token',
          '--api-base',
          baseUrl,
          '--output',
          outputPath,
        ],
        { env: process.env },
      );

      const contents = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, any>;
      expect(contents.color?.primary?.default?.$type).toBe('color');
      expect(
        contents.color?.primary?.default?.$extensions?.['net.lapidist.sources.penpot'],
      ).toBeDefined();
    } finally {
      await rm(workspace, { recursive: true, force: true });
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 120_000);
});
