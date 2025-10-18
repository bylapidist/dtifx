import type { TokenAddition, TokenModification, TokenRemoval, TokenRename } from '../diff.js';
import { normalizeTokenType } from './formatting.js';

export interface EntryGuidance {
  readonly why: string;
  readonly impactSummary: string;
  readonly nextStep: string;
}

export interface ModificationGuidance extends EntryGuidance {
  readonly title: string;
}

/**
 * Provides guidance messaging for an added token.
 *
 * @param entry - The addition entry to describe.
 * @returns Suggested messaging and next steps for the addition.
 */
export function describeAddition(entry: TokenAddition): EntryGuidance {
  const type = normalizeTokenType(entry.next.type);
  const impactSummary =
    entry.impact === 'breaking'
      ? 'Breaking addition: coordinate with consumers before release.'
      : 'Non-breaking addition: publicise availability to adopters.';

  return {
    why: `Introduces new ${type.label} token`,
    impactSummary,
    nextStep:
      entry.impact === 'breaking'
        ? `Confirm downstream usage of ${entry.id} can tolerate the new token.`
        : `Plan adoption for ${entry.id} across consuming teams.`,
  };
}

/**
 * Provides guidance messaging for a removed token.
 *
 * @param entry - The removal entry to describe.
 * @returns Suggested messaging and mitigation steps for the removal.
 */
export function describeRemoval(entry: TokenRemoval): EntryGuidance {
  const type = normalizeTokenType(entry.previous.type);
  const impactSummary =
    entry.impact === 'breaking'
      ? 'Breaking removal: existing references will fail.'
      : 'Removal flagged as non-breaking; verify aliases or fallbacks.';

  return {
    why: `Deletes ${type.label} token`,
    impactSummary,
    nextStep:
      entry.impact === 'breaking'
        ? `Audit consumers of ${entry.id} and migrate to replacements.`
        : `Double-check that replacements for ${entry.id} exist before release.`,
  };
}

/**
 * Provides guidance messaging for a renamed token.
 *
 * @param entry - The rename entry to describe.
 * @returns Suggested messaging and actions for the rename.
 */
export function describeRename(entry: TokenRename): EntryGuidance {
  const impactSummary =
    entry.impact === 'breaking'
      ? `Breaking rename: references must switch to ${entry.nextId}.`
      : `Rename marked non-breaking; ensure redirects are in place.`;

  return {
    why: `Pointer moved to ${entry.nextId}`,
    impactSummary,
    nextStep:
      entry.impact === 'breaking'
        ? `Replace usages of ${entry.previousId} with ${entry.nextId}.`
        : `Verify ${entry.previousId} continues to resolve correctly.`,
  };
}

const FIELD_LABELS: Record<TokenModification['changes'][number], string> = {
  value: 'value',
  raw: 'raw data',
  ref: 'reference',
  type: 'type',
  description: 'description',
  extensions: 'extensions',
  deprecated: 'deprecation metadata',
  references: 'references',
  resolutionPath: 'resolution path',
  appliedAliases: 'applied aliases',
};

const VALUE_CHANGE_FIELDS: ReadonlySet<TokenModification['changes'][number]> = new Set([
  'value',
  'raw',
  'ref',
  'type',
]);

/**
 * Provides guidance messaging for a modified token including changed fields.
 *
 * @param entry - The modification entry to describe.
 * @returns Suggested messaging and validation steps for the modification.
 */
export function describeModification(entry: TokenModification): ModificationGuidance {
  const changedFields = entry.changes;
  const hasValueChange = changedFields.some((field) => VALUE_CHANGE_FIELDS.has(field));
  const title = hasValueChange ? 'Value updated' : 'Metadata updated';
  const descriptors = changedFields.map((field) => FIELD_LABELS[field]);
  const why =
    descriptors.length > 0
      ? `Changed fields: ${formatList(descriptors)}`
      : 'Changed fields: none recorded';
  const impactSummary =
    entry.impact === 'breaking'
      ? 'Breaking update: dependent experiences may regress.'
      : 'Non-breaking update: confirm expected outcomes and visuals.';

  return {
    title,
    why,
    impactSummary,
    nextStep:
      entry.impact === 'breaking'
        ? `Coordinate updates for ${entry.id} before release.`
        : `Spot-check ${entry.id} in consuming products.`,
  };
}

function formatList(values: readonly string[]): string {
  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    const [only] = values;
    return only ?? '';
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  const head = values.slice(0, -1).join(', ');
  const tail = values.at(-1);

  if (tail === undefined) {
    return head;
  }

  return `${head}, and ${tail}`;
}
