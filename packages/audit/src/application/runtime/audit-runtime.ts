import { performance } from 'node:perf_hooks';

import type { PolicyTokenSnapshot } from '../../domain/tokens/token-snapshot.js';
import type {
  AuditRunMetadata,
  AuditRunResult,
  AuditTimings,
  AuditReporter,
} from '../reporting/cli-reporters.js';
import { policyEngine } from '../policy-engine/policy-engine.js';
import type { PolicyConfigurationResult } from '../configuration/policies.js';
import type {
  TelemetryAttributeValue,
  TelemetryAttributes,
  TelemetryRuntime,
  TelemetrySpan,
  TelemetrySpanEndOptions,
  TelemetrySpanOptions,
  TelemetrySpanStatus,
  TelemetryTracer,
} from '@dtifx/core/telemetry';

export type AuditTelemetryAttributeScalar = string | number | boolean;
export type AuditTelemetryAttributeValue = TelemetryAttributeValue;
export type AuditTelemetryAttributes = TelemetryAttributes;

export type AuditTelemetrySpanStatus = TelemetrySpanStatus;

export type AuditTelemetrySpanOptions = TelemetrySpanOptions;

export type AuditTelemetrySpanEndOptions = TelemetrySpanEndOptions;

export type AuditTelemetrySpan = TelemetrySpan;

export type AuditTelemetryTracer = TelemetryTracer;

export type AuditTelemetryRuntime = TelemetryRuntime;

export interface AuditPipelineTimings {
  readonly planMs: number;
  readonly parseMs: number;
  readonly resolveMs: number;
  readonly transformMs: number;
  readonly formatMs: number;
  readonly dependencyMs: number;
  readonly totalMs: number;
}

export interface AuditTokenMetrics {
  readonly totalCount: number;
  readonly typedCount: number;
  readonly unreferencedCount: number;
}

export interface AuditTokenResolutionResult {
  readonly snapshots: readonly PolicyTokenSnapshot[];
  readonly metrics: AuditTokenMetrics;
  readonly timings: AuditPipelineTimings;
  readonly metadata?: AuditRunMetadata;
}

export interface AuditTokenResolutionContext {
  readonly span: AuditTelemetrySpan;
}

export interface AuditTokenResolutionPort {
  resolve(context: AuditTokenResolutionContext): Promise<AuditTokenResolutionResult>;
}

export interface AuditRuntimeClock {
  now(): number;
}

export interface CreateAuditRuntimeOptions {
  readonly configuration: PolicyConfigurationResult;
  readonly reporter: AuditReporter;
  readonly telemetry: AuditTelemetryRuntime;
  readonly tokens: AuditTokenResolutionPort;
  readonly spanName?: string;
  readonly clock?: AuditRuntimeClock;
  readonly dispose?: () => void | Promise<void>;
}

export interface AuditRuntime {
  run(): Promise<AuditRunResult>;
}

/**
 * Creates an audit runtime that resolves token snapshots, evaluates policies, and reports results.
 *
 * @param options - Configuration and infrastructure ports required to execute the audit workflow.
 * @returns Runtime instance capable of executing the audit workflow.
 */
export function createAuditRuntime(options: CreateAuditRuntimeOptions): AuditRuntime {
  const spanName = options.spanName ?? 'dtifx.audit.run';
  const clock = options.clock ?? { now: () => performance.now() };

  return {
    async run(): Promise<AuditRunResult> {
      const reporterAttribute = (
        Array.isArray(options.reporter.format)
          ? options.reporter.format.join(',')
          : options.reporter.format
      ) as string;
      const span = options.telemetry.tracer.startSpan(spanName, {
        attributes: {
          reporter: reporterAttribute,
          policyCount: options.configuration.rules.length,
        },
      });

      try {
        const resolveSpan = span.startChild('dtifx.audit.resolve');
        let resolution: AuditTokenResolutionResult;
        try {
          resolution = await options.tokens.resolve({ span: resolveSpan });
          resolveSpan.end({
            attributes: {
              tokenCount: resolution.metrics.totalCount,
              typedTokenCount: resolution.metrics.typedCount,
              unreferencedTokenCount: resolution.metrics.unreferencedCount,
            },
          });
        } catch (error) {
          resolveSpan.end({ status: 'error' });
          throw error;
        }

        const evaluateSpan = span.startChild('dtifx.audit.evaluate');
        const auditStart = clock.now();
        let evaluation: Awaited<ReturnType<typeof policyEngine.run>>;
        try {
          evaluation = await policyEngine.run({
            configuration: options.configuration,
            snapshots: resolution.snapshots,
          });
          evaluateSpan.end({ attributes: { policyCount: evaluation.policies.length } });
        } catch (error) {
          evaluateSpan.end({ status: 'error' });
          throw error;
        }

        const auditMs = clock.now() - auditStart;
        const timings: AuditTimings = {
          ...resolution.timings,
          auditMs,
          totalWithAuditMs: resolution.timings.totalMs + auditMs,
        } satisfies AuditTimings;
        const result: AuditRunResult = {
          policies: evaluation.policies,
          summary: {
            ...evaluation.summary,
            tokenCount: resolution.metrics.totalCount,
          },
          timings,
          ...(resolution.metadata ? { metadata: resolution.metadata } : {}),
        } satisfies AuditRunResult;

        options.reporter.auditSuccess(result);

        span.end({
          attributes: {
            policyCount: evaluation.policies.length,
            tokenCount: resolution.metrics.totalCount,
            typedTokenCount: resolution.metrics.typedCount,
            unreferencedTokenCount: resolution.metrics.unreferencedCount,
            errorCount: evaluation.summary.severity.error,
          },
        });

        return result;
      } catch (error) {
        span.end({ status: 'error' });
        options.reporter.auditFailure(error);
        throw error;
      } finally {
        try {
          await options.telemetry.exportSpans();
        } finally {
          if (options.dispose) {
            await options.dispose();
          }
        }
      }
    },
  } satisfies AuditRuntime;
}
