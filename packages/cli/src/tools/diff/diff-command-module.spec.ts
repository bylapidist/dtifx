import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@dtifx/diff', () => ({
  runDiffSession: vi.fn(),
  createSessionTokenSourcePort: vi.fn(),
  createRunContext: vi.fn(),
  renderReport: vi.fn(),
  supportsCliHyperlinks: vi.fn(() => false),
}));

const diffPackageVersionModule = vi.hoisted(() => ({
  loadDiffPackageVersion: vi.fn(() => '9.9.9-test'),
}));

vi.mock('./diff-package-version.js', () => diffPackageVersionModule);

const { loadDiffPackageVersion } = diffPackageVersionModule;

import { createCliKernel } from '../../kernel/cli-kernel.js';
import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { diffCommandModule } from './diff-command-module.js';
import { createDiffCliKernel, runDiffCli } from './run-diff-cli.js';

const loadDiffMocks = async () => {
  const module = await import('@dtifx/diff');

  return {
    runDiffSession: vi.mocked(module.runDiffSession),
    createSessionTokenSourcePort: vi.mocked(module.createSessionTokenSourcePort),
    createRunContext: vi.mocked(module.createRunContext),
    renderReport: vi.mocked(module.renderReport),
    supportsCliHyperlinks: vi.mocked(module.supportsCliHyperlinks),
  };
};

describe('diffCommandModule', () => {
  const kernelOptions = {
    programName: 'dtifx',
    version: '0.0.0-test',
  } as const;

  beforeEach(async () => {
    const mocks = await loadDiffMocks();
    mocks.runDiffSession.mockReset();
    mocks.createSessionTokenSourcePort.mockReset();
    mocks.createRunContext.mockReset();
    mocks.renderReport.mockReset();
    mocks.supportsCliHyperlinks.mockReturnValue(false);
    loadDiffPackageVersion.mockReset();
    loadDiffPackageVersion.mockReturnValue('9.9.9-test');
  });

  it('executes compare commands via the diff workflow', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(diffCommandModule);

    const mocks = await loadDiffMocks();
    const tokenSource = Symbol('tokenSource');
    const filteredDiff = Symbol('filteredDiff');

    mocks.createSessionTokenSourcePort.mockReturnValue(tokenSource);
    mocks.runDiffSession.mockResolvedValue({
      filteredDiff,
      failure: { shouldFail: false },
    });
    mocks.renderReport.mockResolvedValue('rendered output');
    mocks.createRunContext.mockReturnValue({} as never);

    const exitCode = await kernel.run([
      'node',
      'dtifx',
      'diff',
      'compare',
      'previous.json',
      'next.json',
    ]);

    expect(exitCode).toBe(0);
    expect(mocks.createSessionTokenSourcePort).toHaveBeenCalledWith(
      {
        previous: { kind: 'file', target: 'previous.json' },
        next: { kind: 'file', target: 'next.json' },
      },
      expect.objectContaining({
        onDiagnostic: expect.any(Function),
        warn: expect.any(Function),
      }),
    );
    expect(mocks.runDiffSession).toHaveBeenCalledTimes(1);
    expect(mocks.runDiffSession).toHaveBeenCalledWith(
      expect.objectContaining({ tokenSource }),
      expect.objectContaining({
        filter: expect.objectContaining({}),
        failure: expect.objectContaining({
          failOnBreaking: false,
          failOnChanges: false,
        }),
      }),
    );
    expect(mocks.renderReport).toHaveBeenCalledWith(
      filteredDiff,
      expect.objectContaining({ format: 'cli' }),
      expect.any(Object),
    );
    expect(io.stdoutBuffer).toBe('rendered output\n');
  });

  it('returns a non-zero exit code when diff failure policies trigger', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(diffCommandModule);

    const mocks = await loadDiffMocks();

    mocks.createSessionTokenSourcePort.mockReturnValue(Symbol('tokenSource'));
    mocks.runDiffSession.mockResolvedValue({
      filteredDiff: Symbol('filtered'),
      failure: { shouldFail: true, reason: 'breaking-changes', matchedCount: 2 },
    });
    mocks.renderReport.mockResolvedValue('rendered output');
    mocks.createRunContext.mockReturnValue({} as never);

    const exitCode = await kernel.run([
      'node',
      'dtifx',
      'diff',
      'compare',
      'previous.json',
      'next.json',
    ]);

    expect(exitCode).toBe(1);
    expect(io.stderrBuffer).toContain('DTIFx diff: failing because 2 breaking changes detected');
  });

  it('shows diff help without invoking the compare workflow', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(diffCommandModule);

    const exitCode = await kernel.run(['node', 'dtifx', 'diff', '--help']);

    expect(exitCode).toBe(0);
    const mocks = await loadDiffMocks();
    expect(mocks.runDiffSession).not.toHaveBeenCalled();
    expect(io.stdoutBuffer).toContain('Usage: dtifx diff');
    expect(io.stdoutBuffer).toContain('compare [options] [previous] [next]');
  });

  it('prints the @dtifx/diff version from the diff command', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(diffCommandModule);

    const exitCode = await kernel.run(['node', 'dtifx', 'diff', '--version']);

    expect(exitCode).toBe(0);
    expect(io.stdoutBuffer).toBe('9.9.9-test\n');
    expect(loadDiffPackageVersion).toHaveBeenCalled();
    const mocks = await loadDiffMocks();
    expect(mocks.runDiffSession).not.toHaveBeenCalled();
  });

  it('describes compare options via Commander help', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(diffCommandModule);

    const exitCode = await kernel.run(['node', 'dtifx', 'diff', 'compare', '--help']);

    expect(exitCode).toBe(0);
    expect(io.stdoutBuffer).toContain('--format <format>');
    expect(io.stdoutBuffer).toContain('--filter-type <types>');
  });
});

describe('diff CLI helpers', () => {
  const version = '0.0.0-test';

  it('creates kernels with the diff module registered', async () => {
    const io = createMemoryCliIo();
    const kernel = createDiffCliKernel({
      programName: 'dtifx',
      version,
      io,
    });

    const exitCode = await kernel.run(['node', 'dtifx', 'diff', '--help']);

    expect(exitCode).toBe(0);
    expect(io.stdoutBuffer).toContain('Usage: dtifx diff');
  });

  it('runs diff commands via the shared helper', async () => {
    const io = createMemoryCliIo();
    const mocks = await loadDiffMocks();

    mocks.createSessionTokenSourcePort.mockReturnValue(Symbol('tokenSource'));
    mocks.runDiffSession.mockResolvedValue({
      filteredDiff: Symbol('filtered'),
      failure: { shouldFail: false },
    });
    mocks.renderReport.mockResolvedValue('rendered output');
    mocks.createRunContext.mockReturnValue({} as never);

    const exitCode = await runDiffCli({
      argv: ['node', 'dtifx', 'diff', 'compare', 'previous.json', 'next.json'],
      programName: 'dtifx',
      version,
      io,
    });

    expect(exitCode).toBe(0);
    expect(mocks.runDiffSession).toHaveBeenCalledOnce();
  });

  it('honors failure policy toggles provided via CLI flags', async () => {
    const io = createMemoryCliIo();
    const mocks = await loadDiffMocks();

    const tokenSource = Symbol('tokenSource');

    mocks.createSessionTokenSourcePort.mockReturnValue(tokenSource);
    mocks.runDiffSession.mockResolvedValue({
      filteredDiff: Symbol('filtered'),
      failure: { shouldFail: false },
    });
    mocks.renderReport.mockResolvedValue('rendered output');
    mocks.createRunContext.mockReturnValue({} as never);

    await runDiffCli({
      argv: [
        'node',
        'dtifx',
        'diff',
        'compare',
        'previous.json',
        'next.json',
        '--fail-on-breaking',
        '--fail-on-changes',
      ],
      programName: 'dtifx',
      version,
      io,
    });

    expect(mocks.runDiffSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ tokenSource }),
      expect.objectContaining({
        failure: expect.objectContaining({
          failOnBreaking: true,
          failOnChanges: true,
        }),
      }),
    );

    mocks.runDiffSession.mockClear();
    mocks.createSessionTokenSourcePort.mockClear();
    mocks.createSessionTokenSourcePort.mockReturnValue(tokenSource);

    await runDiffCli({
      argv: [
        'node',
        'dtifx',
        'diff',
        'compare',
        'previous.json',
        'next.json',
        '--fail-on-breaking',
        '--no-fail-on-breaking',
        '--fail-on-changes',
        '--no-fail-on-changes',
      ],
      programName: 'dtifx',
      version,
      io,
    });

    expect(mocks.runDiffSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ tokenSource }),
      expect.objectContaining({
        failure: expect.objectContaining({
          failOnBreaking: false,
          failOnChanges: false,
        }),
      }),
    );
  });
});
