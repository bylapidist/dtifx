import type { JsonPointer } from '@lapidist/dtif-parser';
import type { RuleProperties } from 'json-rules-engine';

import type { PolicySeverity } from '../summary.js';
import type { PolicyTokenSnapshot } from '../tokens/index.js';

/**
 * Mapping between policy severities and their rule execution priority.
 * Higher priority numbers run first in {@link json-rules-engine}'s scheduler.
 */
export const POLICY_SEVERITY_PRIORITIES: Readonly<Record<PolicySeverity, number>> = Object.freeze({
  error: 100,
  warning: 50,
  info: 10,
});

/**
 * Maps a {@link PolicySeverity} to the {@link RuleProperties.priority} used by the rules engine.
 *
 * @param {PolicySeverity} severity - The policy severity to translate.
 * @returns {number} A deterministic priority value where higher severities execute first.
 */
export function mapPolicySeverityToPriority(severity: PolicySeverity): number {
  return POLICY_SEVERITY_PRIORITIES[severity];
}

export interface PolicyRuleMetadata extends RuleProperties {
  readonly policy: string;
  readonly severity: PolicySeverity;
}

export interface PolicyTokenFact {
  readonly pointer: JsonPointer;
  readonly type?: string;
  readonly value: unknown;
  readonly raw?: unknown;
  readonly metadata?: PolicyTokenSnapshot['metadata'];
  readonly snapshot: PolicyTokenSnapshot;
}

export interface PolicyTokenFactSet {
  readonly tokens: readonly PolicyTokenFact[];
  readonly pointerHistory: Readonly<Record<JsonPointer, readonly PolicyTokenFact[]>>;
  readonly latestByPointer: Readonly<Record<JsonPointer, PolicyTokenFact>>;
  readonly tokensById: Readonly<Record<string, PolicyTokenFact>>;
}

/**
 * Converts a {@link PolicyTokenSnapshot} into the fact payload consumed by the rules engine.
 * The shape mirrors the imperative PolicyInput surface so existing metadata remains accessible.
 *
 * @param {PolicyTokenSnapshot} snapshot - The snapshot that should be exposed to the rules runtime.
 * @returns {PolicyTokenFact} The fact representation that the rules engine evaluates.
 */
export function createPolicyTokenFact(snapshot: PolicyTokenSnapshot): PolicyTokenFact {
  const tokenType = snapshot.token.type;
  const raw = snapshot.token.raw;
  const metadata = snapshot.metadata;
  const value = snapshot.resolution?.value ?? snapshot.token.value ?? raw ?? undefined;

  return {
    pointer: snapshot.pointer,
    snapshot,
    value,
    ...(tokenType === undefined ? {} : { type: tokenType }),
    ...(raw === undefined ? {} : { raw }),
    ...(metadata === undefined ? {} : { metadata }),
  } satisfies PolicyTokenFact;
}

/**
 * Builds a collection of immutable token facts and lookup indices for the rules engine to query.
 *
 * @param {readonly PolicyTokenSnapshot[]} snapshots - The raw token snapshots gathered from token resolution.
 * @returns {PolicyTokenFactSet} The facts and supporting indices required for policy evaluation.
 */
export function createPolicyTokenFactSet(
  snapshots: readonly PolicyTokenSnapshot[],
): PolicyTokenFactSet {
  const tokens = snapshots.map((snapshot) => createPolicyTokenFact(snapshot));
  const pointerBuckets = new Map<JsonPointer, PolicyTokenFact[]>();
  const tokensById = new Map<string, PolicyTokenFact>();

  for (const fact of tokens) {
    const bucket = pointerBuckets.get(fact.pointer);
    if (bucket) {
      bucket.push(fact);
    } else {
      pointerBuckets.set(fact.pointer, [fact]);
    }

    const id = fact.snapshot.token.id;
    if (typeof id === 'string' && id.length > 0) {
      tokensById.set(id, fact);
    }
  }

  const pointerHistoryEntries: [JsonPointer, readonly PolicyTokenFact[]][] = [];
  const latestEntries: [JsonPointer, PolicyTokenFact][] = [];

  for (const [pointer, bucket] of pointerBuckets) {
    const sorted = bucket.toSorted(
      (left, right) => left.snapshot.provenance.layerIndex - right.snapshot.provenance.layerIndex,
    );
    pointerHistoryEntries.push([pointer, Object.freeze(sorted) as readonly PolicyTokenFact[]]);
    latestEntries.push([pointer, sorted.at(-1) ?? bucket[0]!]);
  }

  return Object.freeze({
    tokens: Object.freeze(tokens) as readonly PolicyTokenFact[],
    pointerHistory: Object.freeze(
      Object.fromEntries(pointerHistoryEntries) as Record<JsonPointer, readonly PolicyTokenFact[]>,
    ),
    latestByPointer: Object.freeze(
      Object.fromEntries(latestEntries) as Record<JsonPointer, PolicyTokenFact>,
    ),
    tokensById: Object.freeze(Object.fromEntries(tokensById) as Record<string, PolicyTokenFact>),
  }) satisfies PolicyTokenFactSet;
}
