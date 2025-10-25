import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  extractFigmaTokens as extractFigmaTokensType,
  extractPenpotTokens as extractPenpotTokensType,
  extractSketchTokens as extractSketchTokensType,
} from '@dtifx/extractors';

type ExtractFigmaTokens = typeof extractFigmaTokensType;
type ExtractPenpotTokens = typeof extractPenpotTokensType;
type ExtractSketchTokens = typeof extractSketchTokensType;

const extractFigmaTokensMock = vi.fn<ExtractFigmaTokens>();
const extractPenpotTokensMock = vi.fn<ExtractPenpotTokens>();
const extractSketchTokensMock = vi.fn<ExtractSketchTokens>();

vi.mock('@dtifx/core', () => ({
  formatUnknownError: (error: unknown) =>
    error instanceof Error ? `${error.name}: ${error.message}` : String(error),
}));

vi.mock('@dtifx/extractors', () => ({
  extractFigmaTokens: extractFigmaTokensMock,
  extractPenpotTokens: extractPenpotTokensMock,
  extractSketchTokens: extractSketchTokensMock,
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
    extractPenpotTokensMock.mockReset();
    extractSketchTokensMock.mockReset();
    mkdir.mockReset();
    writeFile.mockReset();
    delete process.env.FIGMA_ACCESS_TOKEN;
    delete process.env.PENPOT_ACCESS_TOKEN;
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

  it('supports optional Figma arguments for node filtering and API overrides', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(extractCommandModule);

    extractFigmaTokensMock.mockResolvedValue({
      document: { ok: true },
      warnings: [],
    });

    const exitCode = await kernel.run([
      'node',
      'dtifx',
      'extract',
      'figma',
      '--file',
      'with-nodes',
      '--token',
      'token',
      '--node',
      'first',
      '--node',
      'second',
      '--api-base',
      'https://api.figma.test',
    ]);

    expect(exitCode).toBe(0);
    const options = extractFigmaTokensMock.mock.calls[0]?.[0];
    expect(options).toMatchObject({
      fileKey: 'with-nodes',
      personalAccessToken: 'token',
      apiBaseUrl: 'https://api.figma.test',
      nodeIds: ['first', 'second'],
    });
    const defaultOutput = path.resolve(path.join('tokens', 'with-nodes.figma.json'));
    expect(writeFile).toHaveBeenCalledWith(defaultOutput, expect.any(String), 'utf8');
  });

  it('reports unexpected Figma extraction failures', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(extractCommandModule);

    extractFigmaTokensMock.mockRejectedValue(new Error('network outage'));

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

    expect(exitCode).toBe(1);
    expect(io.stderrBuffer).toContain('Failed to extract Figma tokens: Error: network outage');
  });

  it('writes Penpot tokens using environment credentials when available', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(extractCommandModule);

    process.env.PENPOT_ACCESS_TOKEN = 'penpot-token';
    extractPenpotTokensMock.mockResolvedValue({
      document: { ok: true },
      warnings: [{ code: 'slow-api', message: 'Penpot warning' }],
    });

    const exitCode = await kernel.run([
      'node',
      'dtifx',
      'extract',
      'penpot',
      '--file',
      'penpot-file',
      '--api-base',
      'https://penpot.test',
    ]);

    expect(exitCode).toBe(0);
    const options = extractPenpotTokensMock.mock.calls[0]?.[0];
    expect(options).toMatchObject({
      fileId: 'penpot-file',
      accessToken: 'penpot-token',
      apiBaseUrl: 'https://penpot.test',
    });
    const defaultOutput = path.resolve(path.join('tokens', 'penpot-file.penpot.json'));
    expect(writeFile).toHaveBeenCalledWith(defaultOutput, expect.any(String), 'utf8');
    expect(io.stderrBuffer).toContain('Warning: Penpot warning');
  });

  it('fails when Penpot credentials are missing', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(extractCommandModule);

    const exitCode = await kernel.run([
      'node',
      'dtifx',
      'extract',
      'penpot',
      '--file',
      'missing-token',
    ]);

    expect(exitCode).toBe(1);
    expect(io.stderrBuffer).toContain('Penpot access token is required');
    expect(extractPenpotTokensMock).not.toHaveBeenCalled();
  });

  it('reports unexpected Penpot extraction failures', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(extractCommandModule);

    process.env.PENPOT_ACCESS_TOKEN = 'penpot-token';
    extractPenpotTokensMock.mockRejectedValue(new Error('penpot offline'));

    const exitCode = await kernel.run([
      'node',
      'dtifx',
      'extract',
      'penpot',
      '--file',
      'penpot-file',
    ]);

    expect(exitCode).toBe(1);
    expect(io.stderrBuffer).toContain('Failed to extract Penpot tokens: Error: penpot offline');
  });

  it('writes Sketch tokens to the derived default output path', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(extractCommandModule);

    extractSketchTokensMock.mockResolvedValue({ document: { ok: true }, warnings: [] });

    const sketchSource = path.join('fixtures', 'brand.sketch');
    const exitCode = await kernel.run([
      'node',
      'dtifx',
      'extract',
      'sketch',
      '--file',
      sketchSource,
    ]);

    expect(exitCode).toBe(0);
    const options = extractSketchTokensMock.mock.calls[0]?.[0];
    expect(options).toMatchObject({ filePath: path.resolve(sketchSource) });
    const defaultOutput = path.resolve(path.join('tokens', 'brand.sketch.json'));
    expect(writeFile).toHaveBeenCalledWith(defaultOutput, expect.any(String), 'utf8');
  });

  it('reports unexpected Sketch extraction failures', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(extractCommandModule);

    extractSketchTokensMock.mockRejectedValue(new Error('sketch parse error'));

    const exitCode = await kernel.run([
      'node',
      'dtifx',
      'extract',
      'sketch',
      '--file',
      'design.sketch',
    ]);

    expect(exitCode).toBe(1);
    expect(io.stderrBuffer).toContain('Failed to extract Sketch tokens: Error: sketch parse error');
  });
});
