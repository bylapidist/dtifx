import { performance } from 'node:perf_hooks';

import type { JsonPointer } from '@lapidist/dtif-parser';
import { JSON_POINTER_ROOT } from '@lapidist/dtif-parser';

import {
  convertTokenSourceIssueToDiagnostic,
  type DiagnosticEvent,
  type TokenSourceRepositoryIssue,
} from '@dtifx/core';
import type { BuildConfig, SourcePlan } from '../../config/index.js';
import type {
  BuildLifecycleObserverPort,
  DomainEventBusPort,
  SourceIssue,
} from '../../domain/ports/index.js';
import {
  SourcePlanningService,
  UnknownLayerError,
} from '../../domain/services/source-planning-service.js';
import { DefaultSourceRepository, type DefaultSourceRepositoryOptions } from '@dtifx/core/sources';
import { DtifSchemaValidationAdapter } from '../../infrastructure/validation/dtif-schema-validator.js';
import { noopLogger, type StructuredLogger } from '@dtifx/core/logging';

interface ValidationErrorDetail {
  readonly keyword: string;
  readonly instancePath: string;
  readonly schemaPath: string;
  readonly message?: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface SourcePlannerFailure {
  readonly sourceId: string;
  readonly uri: string;
  readonly pointerPrefix: JsonPointer | string;
  readonly errors: readonly ValidationErrorDetail[];
}

export class SourcePlannerError extends Error {
  readonly failures: readonly SourcePlannerFailure[];
  readonly diagnostics: readonly DiagnosticEvent[];

  constructor(
    message: string,
    failures: readonly SourcePlannerFailure[],
    diagnostics: readonly DiagnosticEvent[] = [],
  ) {
    super(message);
    this.name = 'SourcePlannerError';
    this.failures = failures;
    this.diagnostics = diagnostics;
  }
}

export interface PlannerOptions extends DefaultSourceRepositoryOptions {
  readonly logger?: StructuredLogger;
  readonly eventBus?: DomainEventBusPort;
  readonly observers?: readonly BuildLifecycleObserverPort[];
}

export class SourcePlanner {
  private readonly logger: StructuredLogger;
  private readonly service: SourcePlanningService;

  constructor(
    private readonly config: BuildConfig,
    options: PlannerOptions = {},
  ) {
    this.logger = options.logger ?? noopLogger;
    const repository = new DefaultSourceRepository({
      ...(options.readFile ? { readFile: options.readFile } : {}),
      ...(options.glob ? { glob: options.glob } : {}),
      ...(options.cwd ? { cwd: options.cwd } : {}),
    });
    const validator = new DtifSchemaValidationAdapter();
    this.service = new SourcePlanningService({
      repository,
      validator,
      ...(options.eventBus ? { eventBus: options.eventBus } : {}),
      ...(options.observers ? { observers: options.observers } : {}),
    });
  }

  async plan(): Promise<SourcePlan> {
    const start = performance.now();
    try {
      const result = await this.service.plan(this.config);
      if (result.issues.length > 0) {
        const failures = this.toFailures(result.issues);
        const diagnostics = this.toDiagnostics(result.issues);
        this.logValidationFailure(result.durationMs, failures.length);
        throw new SourcePlannerError(
          'One or more DTIF sources failed validation',
          failures,
          diagnostics,
        );
      }
      this.logCompleted(result.durationMs, result.plan.entries.length);
      return result.plan;
    } catch (error) {
      if (error instanceof UnknownLayerError) {
        const failure = this.toUnknownLayerFailure(error);
        const failures: readonly SourcePlannerFailure[] = [failure];
        const diagnostics = [this.toUnknownLayerDiagnostic(failure)];
        const durationMs = performance.now() - start;
        this.logValidationFailure(durationMs, failures.length);
        throw new SourcePlannerError(error.message, failures, diagnostics);
      }
      throw error;
    }
  }

  private logCompleted(durationMs: number, entryCount: number): void {
    this.logger.log({
      level: 'info',
      name: 'source-planner',
      event: 'planner.plan.completed',
      elapsedMs: durationMs,
      data: { entryCount },
    });
  }

  private logValidationFailure(durationMs: number, errorCount: number): void {
    this.logger.log({
      level: 'error',
      name: 'source-planner',
      event: 'planner.validation.failed',
      elapsedMs: durationMs,
      data: { errorCount },
    });
  }

  private toFailures(issues: readonly SourceIssue[]): SourcePlannerFailure[] {
    const grouped = new Map<
      string,
      {
        readonly sourceId: string;
        readonly uri: string;
        readonly pointerPrefix: JsonPointer | string;
        errors: ValidationErrorDetail[];
      }
    >();

    for (const issue of issues) {
      const key = `${issue.sourceId}|${issue.uri}|${issue.pointerPrefix}`;
      const detail = this.toValidationDetail(issue);
      const existing = grouped.get(key);
      if (existing) {
        existing.errors.push(detail);
        continue;
      }
      grouped.set(key, {
        sourceId: issue.sourceId,
        uri: issue.uri,
        pointerPrefix: issue.pointerPrefix,
        errors: [detail],
      });
    }

    return [...grouped.values()].map((failure) => ({
      sourceId: failure.sourceId,
      uri: failure.uri,
      pointerPrefix: failure.pointerPrefix,
      errors: [...failure.errors],
    }));
  }

  private toDiagnostics(issues: readonly SourceIssue[]): DiagnosticEvent[] {
    return issues.map((issue) =>
      convertTokenSourceIssueToDiagnostic(issue, { label: issue.sourceId }),
    );
  }

  private toValidationDetail(issue: SourceIssue): ValidationErrorDetail {
    if (issue.kind === 'validation') {
      return {
        keyword: issue.keyword,
        instancePath: issue.instancePath,
        schemaPath: issue.schemaPath ?? '',
        ...(issue.message ? { message: issue.message } : {}),
        params: issue.params ?? {},
      } satisfies ValidationErrorDetail;
    }
    return {
      keyword: issue.code,
      instancePath: '',
      schemaPath: '',
      message: issue.message,
      params: issue.details ?? {},
    } satisfies ValidationErrorDetail;
  }

  private toUnknownLayerFailure(error: UnknownLayerError): SourcePlannerFailure {
    const source = this.config.sources.find((candidate) => candidate.id === error.sourceId);
    const pointerPrefix = source?.pointerTemplate.base ?? JSON_POINTER_ROOT;
    let uri = `source:${error.sourceId}`;
    if (source?.kind === 'virtual') {
      uri = `virtual:${source.id}`;
    }
    return {
      sourceId: error.sourceId,
      uri,
      pointerPrefix,
      errors: [
        {
          keyword: 'layer',
          instancePath: '',
          schemaPath: '',
          message: `Unknown layer "${error.layer}" referenced by source "${error.sourceId}"`,
          params: {},
        },
      ],
    } satisfies SourcePlannerFailure;
  }

  private toUnknownLayerDiagnostic(failure: SourcePlannerFailure): DiagnosticEvent {
    const issue: TokenSourceRepositoryIssue = {
      kind: 'repository',
      sourceId: failure.sourceId,
      uri: failure.uri,
      pointerPrefix: failure.pointerPrefix,
      code: 'layer',
      message: failure.errors[0]?.message ?? 'Unknown layer referenced by source',
      severity: 'error',
    } satisfies TokenSourceRepositoryIssue;
    return convertTokenSourceIssueToDiagnostic(issue, { label: failure.sourceId });
  }
}
