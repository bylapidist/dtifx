import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { extractFigmaTokens as extractFigmaTokensType } from '@dtifx/extractors';

type ExtractFigmaTokens = typeof extractFigmaTokensType;
const extractFigmaTokensMock = vi.fn<ExtractFigmaTokens>();

vi.mock('@dtifx/extractors', () => ({
  extractFigmaTokens: extractFigmaTokensMock,
}));

interface FigmaNodesFixture {
  nodes?: Record<string, { document?: unknown } | undefined>;
}

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
}));

vi.mock('node:fs/promises', () => ({
  default: fsMocks,
  ...fsMocks,
}));

const { mkdir, writeFile } = fsMocks;

import { createCliKernel } from '../../kernel/cli-kernel.js';
import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { extractCommandModule } from './extract-command-module.js';

describe('extractCommandModule', () => {
  const kernelOptions = {
    programName: 'dtifx',
    version: '0.0.0-test',
  } as const;

  beforeEach(async () => {
    extractFigmaTokensMock.mockReset();
    mkdir.mockReset();
    writeFile.mockReset();
    delete process.env.FIGMA_ACCESS_TOKEN;
  });

  it('writes extracted Figma tokens to the requested file', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(extractCommandModule);

    extractFigmaTokensMock.mockResolvedValue({
      document: { $schema: 'https://dtif.lapidist.net/schema/core.json', $version: '1.0.0' },
      warnings: [],
    });

    const outputPath = path.resolve('tokens/output.json');

    const exitCode = await kernel.run([
      'node',
      'dtifx',
      'extract',
      'figma',
      '--file',
      'abc123',
      '--token',
      'secret-token',
      '--output',
      outputPath,
      '--no-pretty',
    ]);

    expect(exitCode).toBe(0);
    const callArguments = extractFigmaTokensMock.mock.calls[0]?.[0];
    expect(callArguments).toMatchObject({
      fileKey: 'abc123',
      personalAccessToken: 'secret-token',
      fetch: globalThis.fetch,
    });
    expect(callArguments?.nodeIds).toBeUndefined();
    expect(mkdir).toHaveBeenCalledWith(path.dirname(outputPath), { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(outputPath, expect.any(String), 'utf8');
    expect(writeFile.mock.calls[0]?.[1]).toBe(
      JSON.stringify({
        $schema: 'https://dtif.lapidist.net/schema/core.json',
        $version: '1.0.0',
      }),
    );
    expect(io.stdoutBuffer).toContain(`Extracted Figma tokens to ${outputPath}`);
  });

  it('fails when credentials are missing', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(extractCommandModule);

    const exitCode = await kernel.run(['node', 'dtifx', 'extract', 'figma', '--file', 'abc123']);

    expect(exitCode).toBe(1);
    expect(extractFigmaTokensMock).not.toHaveBeenCalled();
    expect(io.stderrBuffer).toContain('Figma personal access token is required');
  });

  it('prints provider warnings to stderr', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(extractCommandModule);

    extractFigmaTokensMock.mockResolvedValue({
      document: { $schema: 'https://dtif.lapidist.net/schema/core.json', $version: '1.0.0' },
      warnings: [{ code: 'missing-style-node', message: 'Sample warning' }],
    });

    const exitCode = await kernel.run([
      'node',
      'dtifx',
      'extract',
      'figma',
      '--file',
      'abc123',
      '--token',
      'token',
    ]);

    expect(exitCode).toBe(0);
    const warningArguments = extractFigmaTokensMock.mock.calls[0]?.[0];
    expect(warningArguments?.nodeIds).toBeUndefined();
    expect(io.stderrBuffer).toContain('Warning: Sample warning');
  });
});
