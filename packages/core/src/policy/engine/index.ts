import type { JsonPointer } from '@lapidist/dtif-parser';
import { Engine, Rule, type Almanac, type Event as EngineEvent } from 'json-rules-engine';

import {
  summarisePolicyViolations,
  type PolicySeverity,
  type PolicyViolationSummary,
} from '../summary.js';

import type { PolicyTokenSnapshot } from '../tokens/index.js';
import { matchesTokenSelector, type TokenSelector } from '../selectors/index.js';
import {
  createPolicyTokenFactSet,
  mapPolicySeverityToPriority,
  type PolicyTokenFact,
  type PolicyTokenFactSet,
} from './facts.js';

export interface PolicyEvaluation {
  readonly severity: PolicySeverity;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface PolicyInput {
  readonly snapshot: PolicyTokenSnapshot;
  readonly pointer: JsonPointer;
  readonly type?: string;
  readonly value: unknown;
  readonly raw?: unknown;
  readonly metadata?: PolicyTokenSnapshot['metadata'];
}

export type PolicyHandler = (
  input: PolicyInput,
  context: PolicyContext,
) =>
  | PolicyEvaluation
  | readonly PolicyEvaluation[]
  | undefined
  | Promise<PolicyEvaluation | readonly PolicyEvaluation[] | undefined>;

export interface PolicyViolation extends PolicyEvaluation {
  readonly policy: string;
  readonly pointer: JsonPointer;
  readonly snapshot: PolicyTokenSnapshot;
}

export interface PolicyExecutionResult {
  readonly name: string;
  readonly violations: readonly PolicyViolation[];
}

export interface PolicySummary extends PolicyViolationSummary {
  readonly policyCount: number;
}

export interface PolicyDefinition {
  readonly name: string;
  readonly selector?: TokenSelector;
  readonly run: PolicyHandler;
}

export interface PolicyRuleDescriptor {
  readonly policy: string;
  readonly selector?: TokenSelector;
  readonly evaluate: PolicyHandler;
}

export interface PolicyRuleSetupOptions {
  readonly engine: Engine;
  readonly factSet: PolicyTokenFactSet;
  readonly context: PolicyContext;
  readonly collectViolation: (violation: PolicyViolation) => void;
}

export type PolicyRuleSetup = (options: PolicyRuleSetupOptions) => void | Promise<void>;

export interface PolicyRule {
  readonly policy: string;
  setup(options: PolicyRuleSetupOptions): void | Promise<void>;
}

export interface PolicyEngineOptions {
  readonly rules?: readonly PolicyRule[];
}

export interface PolicyContext {
  readonly tokens: readonly PolicyTokenSnapshot[];
  getByPointer(pointer: JsonPointer): PolicyTokenSnapshot | undefined;
  getAllByPointer(pointer: JsonPointer): readonly PolicyTokenSnapshot[];
  getById(id: string): PolicyTokenSnapshot | undefined;
}

export class PolicyEngine {
  private readonly rules: readonly PolicyRule[];

  constructor(options: PolicyEngineOptions = {}) {
    this.rules = options.rules ?? [];
  }

  getRules(): readonly PolicyRule[] {
    return this.rules;
  }

  async run(tokens: readonly PolicyTokenSnapshot[]): Promise<PolicyExecutionResult[]> {
    const factSet = createPolicyTokenFactSet(tokens);
    const context = createPolicyContext(factSet);
    const policies: string[] = [];
    const violationBuckets = new Map<string, PolicyViolation[]>();

    for (const rule of this.rules) {
      if (!violationBuckets.has(rule.policy)) {
        violationBuckets.set(rule.policy, []);
        policies.push(rule.policy);
      }
    }

    if (policies.length === 0) {
      return [];
    }

    if (factSet.tokens.length === 0) {
      return policies.map(
        (policy) =>
          ({
            name: policy,
            violations: violationBuckets.get(policy) ?? [],
          }) satisfies PolicyExecutionResult,
      );
    }

    const engine = new Engine([], { allowUndefinedFacts: true });
    const collectViolation = (violation: PolicyViolation): void => {
      const bucket = violationBuckets.get(violation.policy);
      if (bucket) {
        bucket.push(violation);
      }
    };

    for (const rule of this.rules) {
      await rule.setup({
        engine,
        factSet,
        context,
        collectViolation,
      });
    }

    await engine.run({
      tokens: factSet.tokens,
      pointerHistory: factSet.pointerHistory,
      latestByPointer: factSet.latestByPointer,
      tokensById: factSet.tokensById,
    });

    return policies.map(
      (policy) =>
        ({
          name: policy,
          violations: violationBuckets.get(policy) ?? [],
        }) satisfies PolicyExecutionResult,
    );
  }
}

/**
 * Adapts legacy policy definitions into rule installers consumed by {@link PolicyEngine}.
 * @param {readonly PolicyDefinition[]} definitions - Imperative policy definitions.
 * @returns {readonly PolicyRule[]} Rule installers that can be provided to the engine.
 */
export function createPolicyRulesFromDefinitions(
  definitions: readonly PolicyDefinition[],
): readonly PolicyRule[] {
  if (definitions.length === 0) {
    return [];
  }

  return definitions.map((definition) =>
    createPolicyRule({
      policy: definition.name,
      ...(definition.selector ? { selector: definition.selector } : {}),
      evaluate: definition.run,
    }),
  );
}

/**
 * Wraps a policy handler in a {@link PolicyRule} descriptor compatible with the rules engine.
 * @param {PolicyRuleDescriptor} descriptor - Handler metadata, including the policy name and selector.
 * @returns {PolicyRule} A rule installer that can be registered with {@link PolicyEngine}.
 */
export function createPolicyRule(descriptor: PolicyRuleDescriptor): PolicyRule {
  return {
    policy: descriptor.policy,
    async setup({ engine, factSet, context, collectViolation }: PolicyRuleSetupOptions) {
      if (factSet.tokens.length === 0) {
        return;
      }

      const evaluationCache = new Map<number, PolicyEvaluationCacheEntry>();
      const factName = createPolicyEvaluationFactName(descriptor.policy);
      const ruleLookup = new Map<number, Rule>();

      await engine.addFact(
        factName,
        async (params: Record<string, unknown>, _almanac: Almanac): Promise<number | undefined> => {
          const { tokenIndex } = params as unknown as PolicyEvaluationFactParams;
          const cached = evaluationCache.get(tokenIndex);
          if (cached) {
            return cached.priority > 0 ? cached.priority : undefined;
          }

          const tokenFact = factSet.tokens[tokenIndex];

          if (!tokenFact) {
            evaluationCache.set(tokenIndex, EMPTY_EVALUATION_CACHE_ENTRY);
            return undefined;
          }

          if (
            descriptor.selector &&
            !matchesTokenSelector(tokenFact.snapshot, descriptor.selector)
          ) {
            evaluationCache.set(tokenIndex, EMPTY_EVALUATION_CACHE_ENTRY);
            return undefined;
          }

          const evaluations = await evaluatePolicyHandler(descriptor.evaluate, tokenFact, context);

          if (evaluations.length === 0) {
            evaluationCache.set(tokenIndex, EMPTY_EVALUATION_CACHE_ENTRY);
            return undefined;
          }

          const priority = Math.max(
            ...evaluations.map((entry) => mapPolicySeverityToPriority(entry.severity)),
          );
          const cacheEntry: PolicyEvaluationCacheEntry = { evaluations, priority };
          evaluationCache.set(tokenIndex, cacheEntry);

          const rule = ruleLookup.get(tokenIndex);
          if (rule && priority > 0) {
            rule.priority = priority;
          }

          return priority > 0 ? priority : undefined;
        },
      );

      engine.on('success', (event: EngineEvent) => {
        if (event.type !== POLICY_VIOLATION_EVENT_TYPE) {
          return;
        }

        const params = event.params as unknown as PolicyDefinitionViolationEventParams;
        if (params.policy !== descriptor.policy) {
          return;
        }

        const cacheEntry = evaluationCache.get(params.tokenIndex);
        const tokenFact = factSet.tokens[params.tokenIndex];

        if (!cacheEntry || !tokenFact) {
          return;
        }

        for (const evaluation of cacheEntry.evaluations) {
          const violation: PolicyViolation = {
            policy: descriptor.policy,
            pointer: tokenFact.pointer,
            snapshot: tokenFact.snapshot,
            severity: evaluation.severity,
            message: evaluation.message,
            ...(evaluation.details ? { details: evaluation.details } : {}),
          } satisfies PolicyViolation;
          collectViolation(violation);
        }

        evaluationCache.delete(params.tokenIndex);
      });

      for (let index = 0; index < factSet.tokens.length; index += 1) {
        const tokenFact = factSet.tokens[index];
        if (!tokenFact) {
          continue;
        }

        if (descriptor.selector && !matchesTokenSelector(tokenFact.snapshot, descriptor.selector)) {
          continue;
        }

        const params: PolicyDefinitionViolationEventParams = {
          policy: descriptor.policy,
          tokenIndex: index,
        } satisfies PolicyDefinitionViolationEventParams;

        const rule = new Rule({
          name: `${descriptor.policy}#${tokenFact.pointer}#${index.toString(10)}`,
          priority: mapPolicySeverityToPriority('info'),
          conditions: {
            all: [
              {
                fact: factName,
                params: { tokenIndex: index } satisfies PolicyEvaluationFactParams,
                operator: 'greaterThanInclusive',
                value: 1,
              },
            ],
          },
          event: {
            type: POLICY_VIOLATION_EVENT_TYPE,
            params: params as unknown as Record<string, unknown>,
          },
        });
        ruleLookup.set(index, rule);
        engine.addRule(rule);
      }
    },
  } satisfies PolicyRule;
}

/**
 * Summarises policy execution output into aggregate counts by severity.
 * @param {readonly PolicyExecutionResult[]} results - The policy execution results to aggregate.
 * @returns {PolicySummary} Summary counts for policies and violations.
 */
export function summarisePolicyResults(results: readonly PolicyExecutionResult[]): PolicySummary {
  const violationSummary = summarisePolicyViolations(iterateViolations(results));

  return {
    policyCount: results.length,
    violationCount: violationSummary.violationCount,
    severity: violationSummary.severity,
  } satisfies PolicySummary;
}

function* iterateViolations(
  results: readonly PolicyExecutionResult[],
): Generator<PolicyViolation, void, undefined> {
  for (const result of results) {
    for (const violation of result.violations) {
      yield violation;
    }
  }
}

function normaliseEvaluations(
  evaluation: Awaited<ReturnType<PolicyHandler>>,
): readonly PolicyEvaluation[] {
  if (evaluation === undefined) {
    return [];
  }
  if (Array.isArray(evaluation)) {
    return evaluation;
  }
  return [evaluation as PolicyEvaluation] as readonly PolicyEvaluation[];
}

interface PolicyEvaluationCacheEntry {
  readonly evaluations: readonly PolicyEvaluation[];
  readonly priority: number;
}

const EMPTY_EVALUATION_CACHE_ENTRY: PolicyEvaluationCacheEntry = Object.freeze({
  evaluations: Object.freeze([]) as readonly PolicyEvaluation[],
  priority: 0,
});

interface PolicyEvaluationFactParams {
  readonly tokenIndex: number;
}

interface PolicyDefinitionViolationEventParams extends PolicyEvaluationFactParams {
  readonly policy: string;
}

const POLICY_EVALUATION_PRIORITY_FACT = 'policy.evaluationPriority';
const POLICY_VIOLATION_EVENT_TYPE = 'policy.violation';

const EMPTY_TOKEN_SNAPSHOTS = Object.freeze([]) as readonly PolicyTokenSnapshot[];

function createPolicyEvaluationFactName(policy: string): string {
  return `${POLICY_EVALUATION_PRIORITY_FACT}::${policy}`;
}

function createPolicyContext(factSet: PolicyTokenFactSet): PolicyContext {
  const tokens = Object.freeze(
    factSet.tokens.map((fact) => fact.snapshot),
  ) as readonly PolicyTokenSnapshot[];
  const pointerHistoryEntries = Object.entries(factSet.pointerHistory).map(
    ([pointer, history]) =>
      [
        pointer as JsonPointer,
        Object.freeze(history.map((fact) => fact.snapshot)) as readonly PolicyTokenSnapshot[],
      ] as const,
  );
  const latestByPointerEntries = Object.entries(factSet.latestByPointer).map(
    ([pointer, fact]) => [pointer as JsonPointer, fact.snapshot] as const,
  );
  const tokensByIdEntries = Object.entries(factSet.tokensById).map(
    ([id, fact]) => [id, fact.snapshot] as const,
  );

  const pointerHistory = new Map<JsonPointer, readonly PolicyTokenSnapshot[]>(
    pointerHistoryEntries,
  );
  const latestByPointer = new Map<JsonPointer, PolicyTokenSnapshot>(latestByPointerEntries);
  const tokensById = new Map<string, PolicyTokenSnapshot>(tokensByIdEntries);

  return {
    tokens,
    getByPointer(pointer: JsonPointer) {
      return latestByPointer.get(pointer);
    },
    getAllByPointer(pointer: JsonPointer) {
      return pointerHistory.get(pointer) ?? EMPTY_TOKEN_SNAPSHOTS;
    },
    getById(id: string) {
      return tokensById.get(id);
    },
  } satisfies PolicyContext;
}

async function evaluatePolicyHandler(
  handler: PolicyHandler,
  tokenFact: PolicyTokenFact,
  context: PolicyContext,
): Promise<readonly PolicyEvaluation[]> {
  const evaluation = await handler(createPolicyInput(tokenFact), context);
  return normaliseEvaluations(evaluation);
}

function createPolicyInput(tokenFact: PolicyTokenFact): PolicyInput {
  const tokenType = tokenFact.type ?? tokenFact.snapshot.token.type;
  const raw = tokenFact.raw ?? tokenFact.snapshot.token.raw;
  const metadata = tokenFact.metadata ?? tokenFact.snapshot.metadata;
  const value = tokenFact.value;

  return {
    snapshot: tokenFact.snapshot,
    pointer: tokenFact.pointer,
    value,
    ...(tokenType === undefined ? {} : { type: tokenType }),
    ...(raw === undefined ? {} : { raw }),
    ...(metadata === undefined ? {} : { metadata }),
  } satisfies PolicyInput;
}

export {
  createPolicyTokenFact,
  createPolicyTokenFactSet,
  mapPolicySeverityToPriority,
  POLICY_SEVERITY_PRIORITIES,
} from './facts.js';
export type { PolicyRuleMetadata, PolicyTokenFact, PolicyTokenFactSet } from './facts.js';
