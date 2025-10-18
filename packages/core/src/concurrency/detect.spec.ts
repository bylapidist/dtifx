import type { CpuInfo } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

const createCpuInfo = (): CpuInfo => ({
  model: 'stub',
  speed: 0,
  times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
});

afterEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('detectParallelism', () => {
  it('prefers availableParallelism when reported', async () => {
    vi.doMock('node:os', () => ({
      availableParallelism: () => 6,
      cpus: () => Array.from({ length: 12 }, createCpuInfo),
    }));

    const { detectParallelism } = await import('./detect.js');

    expect(detectParallelism()).toBe(6);
  });

  it('falls back to cpu count when availableParallelism is unavailable', async () => {
    vi.doMock('node:os', () => ({
      availableParallelism: () => {
        throw new Error('unsupported');
      },
      cpus: () => Array.from({ length: 4 }, createCpuInfo),
    }));

    const { detectParallelism } = await import('./detect.js');

    expect(detectParallelism()).toBe(4);
  });

  it('returns a minimum of one when no detection data is available', async () => {
    vi.doMock('node:os', () => ({
      availableParallelism: () => 0,
      cpus: () => [],
    }));

    const { detectParallelism } = await import('./detect.js');

    expect(detectParallelism()).toBe(1);
  });
});
