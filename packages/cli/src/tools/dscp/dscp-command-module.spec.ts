import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createCliKernel } from '../../kernel/cli-kernel.js';
import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { dscpCommandModule } from './dscp-command-module.js';

describe('dscpCommandModule', () => {
  const kernelOptions = {
    programName: 'dtifx',
    version: '0.0.0-test',
  } as const;

  it('prints help output when dscp is invoked without a subcommand', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });
    kernel.register(dscpCommandModule);

    await kernel.run(['node', 'dtifx', 'dscp']);

    expect(io.stdoutBuffer).toContain('dscp');
  });

  it('generates DESIGN_SYSTEM.md from a valid build output directory', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'dtifx-dscp-spec-'));
    const outFile = path.join(tmpDir, 'DESIGN_SYSTEM.md');

    // Write a minimal tokens.json matching the FlatToken shape expected by buildDocument
    const tokensJson = JSON.stringify({
      color: {
        brand: {
          id: '#/color/brand',
          pointer: '#/color/brand',
          name: 'brand',
          type: 'color',
          value: '#0066ff',
        },
      },
    });
    await writeFile(path.join(tmpDir, 'tokens.json'), tokensJson, 'utf8');

    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });
    kernel.register(dscpCommandModule);

    await kernel.run(['node', 'dtifx', 'dscp', 'generate', '--from', tmpDir, '--out', outFile]);

    const content = await readFile(outFile, 'utf8');
    expect(content).toContain('# DESIGN_SYSTEM.md');
    expect(content).toContain('Kernel snapshot:');
    expect(io.stdoutBuffer).toContain('DESIGN_SYSTEM.md generated');

    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reports an error when the from directory has no tokens.json', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'dtifx-dscp-empty-'));
    const outFile = path.join(tmpDir, 'DESIGN_SYSTEM.md');

    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });
    kernel.register(dscpCommandModule);

    await kernel.run(['node', 'dtifx', 'dscp', 'generate', '--from', tmpDir, '--out', outFile]);

    expect(io.stderrBuffer).toContain('dscp generate failed');

    await rm(tmpDir, { recursive: true, force: true });
  });
});
