import type { JsonPointer } from '@lapidist/dtif-parser';

import {
  createPolicyRule,
  type PolicyContext,
  type PolicyEvaluation,
  type PolicyRule,
} from '../engine/index.js';
import type { PolicySeverity } from '../summary.js';
import type { PolicyTokenSnapshot } from '../tokens/index.js';
import { extractTokenTags } from '../selectors/token-selector.js';
import { parseColorValue, toColorCssOutput } from '../colors/index.js';

interface RequireOwnerPolicyOptions {
  readonly extensionKey: string;
  readonly field: string;
  readonly severity: PolicySeverity;
  readonly message?: string;
}

interface DeprecationReplacementPolicyOptions {
  readonly severity: PolicySeverity;
  readonly message?: string;
}

interface RequireTagPolicyOptions {
  readonly tags: readonly string[];
  readonly severity: PolicySeverity;
  readonly message?: string;
}

interface RequireOverrideApprovalPolicyOptions {
  readonly layers: readonly string[];
  readonly severity: PolicySeverity;
  readonly extensionKey?: string;
  readonly field?: string;
  readonly minimumApprovals?: number;
  readonly message?: string;
  readonly context?: Readonly<Record<string, string | number | boolean>>;
}

interface WcagContrastPairOptions {
  readonly foreground: JsonPointer;
  readonly background: JsonPointer;
  readonly minimum?: number;
  readonly label?: string;
}

interface WcagContrastPolicyOptions {
  readonly severity: PolicySeverity;
  readonly pairs: readonly WcagContrastPairOptions[];
  readonly minimum?: number;
  readonly message?: string;
}

interface NormalizedWcagContrastPair {
  readonly foreground: JsonPointer;
  readonly background: JsonPointer;
  readonly minimum: number;
  readonly label?: string;
}

type ContrastLabelDescriptor = Pick<NormalizedWcagContrastPair, 'label' | 'foreground'>;

/**
 * Creates a policy that ensures required owner metadata is present on a token snapshot.
 * @param {RequireOwnerPolicyOptions} options - Configuration describing the metadata extension,
 *   field, and severity.
 * @returns {PolicyRule} A policy rule enforcing the owner metadata requirement.
 */
export function createRequireOwnerPolicy(options: RequireOwnerPolicyOptions): PolicyRule {
  const message =
    options.message ??
    `Token is missing required owner metadata (${options.extensionKey}.${options.field}).`;
  return createPolicyRule({
    policy: 'governance.requireOwner',
    evaluate: ({ metadata }) => {
      if (!metadata) {
        return {
          severity: options.severity,
          message,
          details: { reason: 'missing-metadata' },
        } satisfies PolicyEvaluation;
      }
      const extension = metadata.extensions[options.extensionKey];
      if (!isRecord(extension)) {
        return {
          severity: options.severity,
          message,
          details: {
            reason: 'missing-extension',
            extension: options.extensionKey,
          },
        } satisfies PolicyEvaluation;
      }
      const value = extension[options.field];
      if (!isNonEmptyValue(value)) {
        return {
          severity: options.severity,
          message,
          details: {
            reason: 'missing-field',
            extension: options.extensionKey,
            field: options.field,
          },
        } satisfies PolicyEvaluation;
      }
      return;
    },
  });
}

/**
 * Creates a policy that requires deprecated tokens to specify a replacement reference.
 * @param {DeprecationReplacementPolicyOptions} options - Settings controlling severity and custom messaging.
 * @returns {PolicyRule} A policy rule validating deprecated token metadata.
 */
export function createDeprecationReplacementPolicy(
  options: DeprecationReplacementPolicyOptions,
): PolicyRule {
  const message =
    options.message ??
    'Deprecated tokens must define a "supersededBy" reference to their replacement.';
  return createPolicyRule({
    policy: 'governance.deprecationHasReplacement',
    evaluate: ({ metadata }) => {
      if (!metadata?.deprecated) {
        return;
      }
      if (!(metadata.deprecated as { readonly supersededBy?: unknown }).supersededBy) {
        return {
          severity: options.severity,
          message,
          details: { reason: 'missing-superseded-by' },
        } satisfies PolicyEvaluation;
      }
      return;
    },
  });
}

/**
 * Creates a policy that asserts a token is tagged with the provided governance labels.
 * @param {RequireTagPolicyOptions} options - The set of required tags and reporting configuration.
 * @returns {PolicyRule} A policy rule that verifies token tags.
 */
export function createRequireTagPolicy(options: RequireTagPolicyOptions): PolicyRule {
  const required = new Set(options.tags);
  const message =
    options.message ?? `Token is missing required governance tags: ${[...required].join(', ')}.`;
  return createPolicyRule({
    policy: 'governance.requireTag',
    evaluate: ({ snapshot }) => {
      const tags = extractTokenTags(snapshot);
      const missing = [...required].filter((tag) => !tags.has(tag));
      if (missing.length === 0) {
        return;
      }
      return {
        severity: options.severity,
        message,
        details: { missingTags: missing },
      } satisfies PolicyEvaluation;
    },
  });
}

/**
 * Creates a policy that evaluates WCAG contrast ratios between token pairs.
 * @param {WcagContrastPolicyOptions} options - The contrast pairs and severity options.
 * @returns {PolicyRule} A policy rule that checks contrast compliance.
 */
export function createWcagContrastPolicy(options: WcagContrastPolicyOptions): PolicyRule {
  if (options.pairs.length === 0) {
    throw new TypeError('governance.wcagContrast policy requires at least one contrast pair.');
  }
  const defaultMinimum = options.minimum ?? 4.5;
  const normalizedPairs: NormalizedWcagContrastPair[] = options.pairs.map((pair) => ({
    foreground: pair.foreground,
    background: pair.background,
    minimum: pair.minimum ?? defaultMinimum,
    ...(pair.label ? { label: pair.label } : {}),
  }));
  const pairsByPointer = new Map<string, NormalizedWcagContrastPair[]>();
  for (const pair of normalizedPairs) {
    const bucket = pairsByPointer.get(pair.foreground);
    if (bucket) {
      bucket.push(pair);
    } else {
      pairsByPointer.set(pair.foreground, [pair]);
    }
  }

  return createPolicyRule({
    policy: 'governance.wcagContrast',
    evaluate: (input, context) =>
      evaluateContrastPairs(
        input.snapshot,
        context,
        pairsByPointer.get(input.pointer) ?? [],
        options,
      ),
  });
}

/**
 * Creates a policy that validates override approvals recorded in governance metadata.
 * @param {RequireOverrideApprovalPolicyOptions} options - The governance layers, thresholds, and metadata configuration.
 * @returns {PolicyRule} A policy rule enforcing override approvals.
 */
export function createRequireOverrideApprovalPolicy(
  options: RequireOverrideApprovalPolicyOptions,
): PolicyRule {
  if (options.layers.length === 0) {
    throw new TypeError(
      'governance.requireOverrideApproval policy requires at least one layer name.',
    );
  }
  const layers = new Set(options.layers);
  const extensionKey = options.extensionKey ?? 'net.lapidist.governance';
  const field = options.field ?? 'approvedBy';
  const minimum = Math.max(1, options.minimumApprovals ?? 1);
  const layerList = [...layers].join(', ');
  const message =
    options.message ??
    `Overrides in layers ${layerList} require at least ${minimum.toString(
      10,
    )} approval(s) recorded in ${extensionKey}.${field}.`;
  const contextFilters = options.context;

  return createPolicyRule({
    policy: 'governance.requireOverrideApproval',
    evaluate: ({ snapshot }, policyContext): PolicyEvaluation | undefined => {
      if (!layers.has(snapshot.provenance.layer)) {
        return;
      }
      if (contextFilters && !matchesContextFilters(snapshot.context, contextFilters)) {
        return;
      }
      const history = policyContext.getAllByPointer(snapshot.pointer);
      const previous = history.filter(
        (entry) =>
          entry !== snapshot && entry.provenance.layerIndex < snapshot.provenance.layerIndex,
      );
      if (previous.length === 0) {
        return;
      }

      const metadata = snapshot.metadata;
      if (!metadata) {
        return {
          severity: options.severity,
          message,
          details: {
            reason: 'missing-metadata',
            extension: extensionKey,
            field,
            requiredApprovals: minimum,
            overrides: toOverrideDetails(previous),
            ...(contextFilters ? { requiredContext: contextFilters } : {}),
          },
        } satisfies PolicyEvaluation;
      }

      const extension = metadata.extensions[extensionKey];
      if (!isRecord(extension)) {
        return {
          severity: options.severity,
          message,
          details: {
            reason: 'missing-extension',
            extension: extensionKey,
            field,
            requiredApprovals: minimum,
            overrides: toOverrideDetails(previous),
            ...(contextFilters ? { requiredContext: contextFilters } : {}),
          },
        } satisfies PolicyEvaluation;
      }

      const approvals = countApprovalUnits(extension[field]);
      if (approvals < minimum) {
        return {
          severity: options.severity,
          message,
          details: {
            reason: approvals === 0 ? 'approval-missing' : 'insufficient-approvals',
            extension: extensionKey,
            field,
            requiredApprovals: minimum,
            receivedApprovals: approvals,
            overrides: toOverrideDetails(previous),
            ...(contextFilters ? { requiredContext: contextFilters } : {}),
          },
        } satisfies PolicyEvaluation;
      }

      return;
    },
  });
}

function evaluateContrastPairs(
  snapshot: PolicyTokenSnapshot,
  context: PolicyContext,
  pairs: readonly NormalizedWcagContrastPair[],
  options: WcagContrastPolicyOptions,
): readonly PolicyEvaluation[] | undefined {
  if (pairs.length === 0) {
    return;
  }
  const foregroundLuminance = extractRelativeLuminance(snapshot);
  if (foregroundLuminance === undefined) {
    return pairs.map((pair) => ({
      severity: options.severity,
      message:
        options.message ??
        `Unable to evaluate contrast for ${describeLabel(pair)}: foreground token is not a valid srgb color.`,
      details: {
        reason: 'foreground-invalid',
        foreground: pair.foreground,
        background: pair.background,
        ...(pair.label ? { pairLabel: pair.label } : {}),
      },
    }));
  }

  const evaluations = [] as PolicyEvaluation[];
  for (const pair of pairs) {
    const backgroundSnapshot = context.getByPointer(pair.background);
    if (!backgroundSnapshot) {
      evaluations.push({
        severity: options.severity,
        message:
          options.message ??
          `Unable to evaluate contrast for ${describeLabel(pair)}: background token ${pair.background} was not found.`,
        details: {
          reason: 'background-missing',
          foreground: pair.foreground,
          background: pair.background,
          ...(pair.label ? { pairLabel: pair.label } : {}),
        },
      });
      continue;
    }
    const backgroundLuminance = extractRelativeLuminance(backgroundSnapshot);
    if (backgroundLuminance === undefined) {
      evaluations.push({
        severity: options.severity,
        message:
          options.message ??
          `Unable to evaluate contrast for ${describeLabel(pair)}: background token is not a valid srgb color.`,
        details: {
          reason: 'background-invalid',
          foreground: pair.foreground,
          background: pair.background,
          ...(pair.label ? { pairLabel: pair.label } : {}),
        },
      });
      continue;
    }
    const ratio = contrastRatio(foregroundLuminance, backgroundLuminance);
    if (ratio + Number.EPSILON < pair.minimum) {
      evaluations.push({
        severity: options.severity,
        message:
          options.message ??
          `Contrast ratio ${ratio.toFixed(2)}:1 for ${describeLabel(pair)} is below the minimum ${pair.minimum.toFixed(2)}:1 between ${pair.foreground} and ${pair.background}.`,
        details: {
          reason: 'contrast-below-threshold',
          ratio,
          minimum: pair.minimum,
          foreground: pair.foreground,
          background: pair.background,
          ...(pair.label ? { pairLabel: pair.label } : {}),
        },
      });
    }
  }

  return evaluations.length > 0 ? evaluations : undefined;
}

function extractRelativeLuminance(snapshot: PolicyTokenSnapshot): number | undefined {
  const resolutionValue = snapshot.resolution?.value;
  const tokenValue = snapshot.token.value;
  const rawValue = snapshot.token.raw;
  const source = resolutionValue ?? tokenValue ?? rawValue;
  if ((source ?? undefined) === undefined) {
    return;
  }
  const color = parseColorValue(source);
  if (!color || color.colorSpace !== 'srgb') {
    return;
  }
  return toColorCssOutput(color).relativeLuminance;
}

function contrastRatio(foreground: number, background: number): number {
  const lighter = Math.max(foreground, background);
  const darker = Math.min(foreground, background);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 1000) / 1000;
}

function describeLabel(pair: ContrastLabelDescriptor) {
  if (pair.label && pair.label.trim().length > 0) {
    return `"${pair.label}"`;
  }
  return pair.foreground;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Object(value) === value && !Array.isArray(value) && typeof value !== 'function';
}

function isNonEmptyValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }
  return (value ?? undefined) !== undefined;
}

function matchesContextFilters(
  context: Readonly<Record<string, unknown>>,
  filters: Readonly<Record<string, string | number | boolean>>,
): boolean {
  for (const [key, expected] of Object.entries(filters)) {
    if (!Object.prototype.hasOwnProperty.call(context, key)) {
      return false;
    }
    if (context[key] !== expected) {
      return false;
    }
  }
  return true;
}

function countApprovalUnits(value: unknown): number {
  if (typeof value === 'string') {
    return value.trim().length > 0 ? 1 : 0;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? Math.floor(value) : 0;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (Array.isArray(value)) {
    let total = 0;
    for (const entry of value) {
      total += countApprovalUnits(entry);
    }
    return total;
  }
  if (isRecord(value)) {
    return Object.keys(value).length;
  }
  return 0;
}

function toOverrideDetails(overrides: readonly PolicyTokenSnapshot[]): readonly {
  readonly pointer: string;
  readonly layer: string;
  readonly sourceId: string;
  readonly uri: string;
}[] {
  if (overrides.length === 0) {
    return [];
  }
  return overrides.map((entry) => ({
    pointer: entry.pointer,
    layer: entry.provenance.layer,
    sourceId: entry.provenance.sourceId,
    uri: entry.provenance.uri,
  }));
}
