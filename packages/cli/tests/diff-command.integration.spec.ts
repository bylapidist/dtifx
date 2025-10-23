import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliProjectRoot = path.resolve(__dirname, '..');
const diffStubRunner = path.resolve(__dirname, 'helpers', 'run-diff-cli-with-stub.ts');

const runDiffCli = async (args: string[]) => {
  return execFileAsync('pnpm', ['exec', 'tsx', diffStubRunner, ...args], {
    cwd: cliProjectRoot,
    env: process.env,
    maxBuffer: 5 * 1024 * 1024,
  });
};

describe('dtifx diff compare', () => {
  test('writes diff output to nested directories when requested', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'dtifx-cli-diff-'));

    try {
      const previousPath = path.join(workspace, 'previous.json');
      const nextPath = path.join(workspace, 'next.json');
      await writeFile(previousPath, JSON.stringify({ tokens: { alpha: { $value: 'a' } } }), 'utf8');
      await writeFile(nextPath, JSON.stringify({ tokens: { alpha: { $value: 'b' } } }), 'utf8');

      const outputPath = path.join(workspace, 'artifacts', 'reports', 'diff-output.txt');

      await runDiffCli(['diff', 'compare', previousPath, nextPath, '--output', outputPath]);

      const contents = await readFile(outputPath, 'utf8');
      expect(contents).toBe('stub-report\n');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});
