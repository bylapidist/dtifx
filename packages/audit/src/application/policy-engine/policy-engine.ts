import {
  summarisePolicyResults,
  type PolicyExecutionResult,
  type PolicySummary,
  type PolicyViolation,
} from '../../domain/policies/policy-engine.js';
import type { PolicyTokenSnapshot } from '../../domain/tokens/token-snapshot.js';
import type { PolicyConfigurationResult } from '../configuration/policies.js';

export interface PolicyEngineRunOptions {
  readonly configuration: PolicyConfigurationResult;
  readonly snapshot?: PolicyTokenSnapshot;
  readonly snapshots?: readonly PolicyTokenSnapshot[];
}

export interface PolicyEngineRunResult {
  readonly policies: readonly PolicyExecutionResult[];
  readonly findings: readonly PolicyViolation[];
  readonly summary: PolicySummary;
}

export const policyEngine = {
  async run(options: PolicyEngineRunOptions): Promise<PolicyEngineRunResult> {
    const snapshots = resolveSnapshots(options);
    const policies = await options.configuration.engine.run(snapshots);
    const findings = policies.flatMap((policy) => policy.violations);
    return {
      policies,
      findings,
      summary: summarisePolicyResults(policies),
    } satisfies PolicyEngineRunResult;
  },
};

function resolveSnapshots(options: PolicyEngineRunOptions): readonly PolicyTokenSnapshot[] {
  if (options.snapshots !== undefined) {
    return options.snapshots;
  }
  if (options.snapshot) {
    return [options.snapshot];
  }
  throw new TypeError('policyEngine.run requires either a snapshot or snapshots array.');
}
