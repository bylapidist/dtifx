import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryCliIo } from '../../testing/memory-cli-io.js';

const loadModule = async () => import('./audit-module-loader.js');

describe('loadAuditModule', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    const { setAuditModuleImporterForTesting } = await loadModule();
    setAuditModuleImporterForTesting();
    vi.clearAllMocks();
  });

  it('returns the audit module when available', async () => {
    const fakeAudit = { runAudit: vi.fn() } as const;
    const { loadAuditModule, setAuditModuleImporterForTesting } = await loadModule();
    setAuditModuleImporterForTesting(async () => fakeAudit);
    const io = createMemoryCliIo();

    const module = await loadAuditModule({ io });

    expect(module).toBe(fakeAudit);
    expect(io.stderrBuffer).toBe('');
  });

  it('logs a friendly message when the module is missing', async () => {
    const missingModuleError = Object.assign(new Error('Module not found'), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
    const { loadAuditModule, setAuditModuleImporterForTesting } = await loadModule();
    setAuditModuleImporterForTesting(async () => {
      throw missingModuleError;
    });
    const io = createMemoryCliIo();

    const module = await loadAuditModule({ io });

    expect(module).toBeUndefined();
    expect(io.stderrBuffer).toContain('Please install @dtifx/audit');
  });
});
