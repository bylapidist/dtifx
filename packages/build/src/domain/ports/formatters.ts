import type { FileArtifact } from '../../formatter/formatter-registry.js';
import type { FormatterInstanceConfig, FormatterOutputConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../models/tokens.js';
import type { TransformResult } from '../../transform/transform-registry.js';
import type { FormatterDefinition } from '../../formatter/formatter-registry.js';

export interface FormatterPlan {
  readonly id: string;
  readonly name: string;
  readonly definition: FormatterDefinition;
  readonly output: FormatterOutputConfig;
}

export interface FormatterPlannerPort {
  plan(formatters: readonly FormatterInstanceConfig[] | undefined): readonly FormatterPlan[];
}

export interface FormatterExecutorRequest {
  readonly plans: readonly FormatterPlan[];
  readonly snapshots: readonly BuildTokenSnapshot[];
  readonly transforms: readonly TransformResult[];
}

export interface FormatterExecution {
  readonly id: string;
  readonly name: string;
  readonly artifacts: readonly FileArtifact[];
  readonly output: FormatterOutputConfig;
  readonly writtenPaths?: readonly string[];
}

export interface FormatterExecutorResponse {
  readonly executions: readonly FormatterExecution[];
  readonly artifacts: readonly FileArtifact[];
}

export interface FormatterExecutorPort {
  execute(request: FormatterExecutorRequest): Promise<FormatterExecutorResponse>;
}

export interface ArtifactWriterPort {
  write(executions: readonly FormatterExecution[]): Promise<ReadonlyMap<string, readonly string[]>>;
}

export interface FormattingRequest {
  readonly snapshots: readonly BuildTokenSnapshot[];
  readonly transforms?: readonly TransformResult[];
  readonly formatters?: readonly FormatterInstanceConfig[];
  readonly plans?: readonly FormatterPlan[];
}

export interface FormattingResponse {
  readonly durationMs: number;
  readonly executions: readonly FormatterExecution[];
  readonly artifacts: readonly FileArtifact[];
  readonly writes: ReadonlyMap<string, readonly string[]>;
}

export interface FormattingPort {
  run(request: FormattingRequest): Promise<FormattingResponse>;
}
