import type { DocumentCache, TokenCache } from '@lapidist/dtif-parser';

import type { BuildConfig } from '../../config/index.js';
import type { StructuredLogger } from '@dtifx/core/logging';
import type { BuildRuntimeServices } from '../build-runtime.js';
import type { TelemetryRuntime } from '@dtifx/core/telemetry';
import type { PolicyConfigurationResult } from '@dtifx/core/policy/configuration';

export interface LoadedBuildConfiguration {
  readonly path: string;
  readonly directory: string;
  readonly config: BuildConfig;
}

export interface RuntimeEnvironment {
  readonly loaded: LoadedBuildConfiguration;
  readonly logger: StructuredLogger;
  readonly telemetry: TelemetryRuntime;
  readonly documentCache: DocumentCache;
  readonly tokenCache: TokenCache;
  readonly services: BuildRuntimeServices;
  readonly policyConfiguration: PolicyConfigurationResult;
  dispose(): void;
}

export interface RuntimeEnvironmentFactoryRequest {
  readonly configPath: string;
  readonly documentCache?: DocumentCache;
  readonly tokenCache?: TokenCache;
}

export type RuntimeEnvironmentFactory = (
  request: RuntimeEnvironmentFactoryRequest,
) => Promise<RuntimeEnvironment>;
