import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Writable } from 'node:stream';

import { noopLogger } from '@dtifx/core/logging';
import { createTelemetryRuntime } from '@dtifx/core/telemetry';
import { createAuditRuntime, type AuditTelemetryRuntime } from './audit-runtime.js';
import { createAuditTokenResolutionEnvironment } from './audit-token-resolution-environment.js';
import { loadAuditConfiguration } from '../configuration/config-loader.js';
import { createAuditReporter } from '../reporting/cli-reporters.js';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixtureDirectory = path.resolve(__dirname, '../../..', 'tests/fixtures/cli-smoke');
const fixtureConfigPath = path.resolve(fixtureDirectory, 'dtifx.config.json');

const createWritableBuffer = () => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      callback();
    },
  });
  return {
    stream,
    toString(): string {
      return chunks.join('');
    },
  } as const;
};

describe('audit runtime integration', () => {
  it('resolves configured sources and reports audit violations', async () => {
    const telemetry = createTelemetryRuntime('none', {
      logger: noopLogger,
    }) as AuditTelemetryRuntime;
    const loadedConfig = await loadAuditConfiguration({ path: fixtureConfigPath });
    const tokenEnvironment = await createAuditTokenResolutionEnvironment({
      telemetry,
      logger: noopLogger,
      configuration: loadedConfig,
    });

    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const reporter = createAuditReporter({
      format: 'json',
      logger: noopLogger,
      stdout: stdout.stream,
      stderr: stderr.stream,
    });

    const runtime = createAuditRuntime({
      configuration: tokenEnvironment.policyConfiguration,
      telemetry,
      tokens: tokenEnvironment.tokens,
      reporter,
      dispose: () => tokenEnvironment.dispose(),
    });

    const result = await runtime.run();

    const payloadText = stdout.toString().trim();
    stdout.stream.end();
    stderr.stream.end();
    const payload = JSON.parse(payloadText);

    expect(result.summary.violationCount).toBe(2);
    expect(result.summary.severity.error).toBe(0);
    expect(result.summary.severity.warning).toBe(2);
    expect(result.policies).toHaveLength(2);
    expect(result.summary.tokenCount).toBeGreaterThan(0);
    expect(payload).toMatchObject({
      event: 'audit.completed',
      status: 'warn',
      summary: expect.objectContaining({ violationCount: 2 }),
    });
  });
});
