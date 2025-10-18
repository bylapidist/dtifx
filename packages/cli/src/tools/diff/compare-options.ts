import type { SessionTokenSources } from '@dtifx/diff';
import type { TokenChangeImpact, TokenChangeKind } from '@dtifx/diff';

export type OutputFormat = 'cli' | 'json' | 'markdown' | 'html' | 'yaml' | 'sarif' | 'template';

export interface TemplatePartialDefinition {
  readonly name: string;
  readonly path: string;
}

export interface CompareCommandOptions {
  readonly format: OutputFormat;
  readonly outputPath?: string;
  readonly color: boolean;
  readonly unicode?: boolean;
  readonly templatePath?: string;
  readonly templatePartials: readonly TemplatePartialDefinition[];
  readonly templateAllowUnescapedOutput: boolean;
  readonly renameStrategy?: string;
  readonly impactStrategy?: string;
  readonly summaryStrategy?: string;
  readonly filterTypes: readonly string[];
  readonly filterPaths: readonly string[];
  readonly filterGroups: readonly string[];
  readonly filterImpacts: readonly TokenChangeImpact[];
  readonly filterKinds: readonly TokenChangeKind[];
  readonly mode: 'full' | 'summary' | 'condensed';
  readonly failOnBreaking: boolean;
  readonly failOnChanges: boolean;
  readonly verbose: boolean;
  readonly why: boolean;
  readonly diffContext: number;
  readonly topRisks: number;
  readonly links: boolean;
  readonly quiet: boolean;
}

export interface ResolveCompareDefaults {
  readonly color?: boolean;
  readonly links?: boolean;
}

export interface CommanderCompareOptions {
  readonly format?: string;
  readonly output?: string;
  readonly color?: boolean;
  readonly unicode?: boolean;
  readonly template?: string;
  readonly templatePartial?: string[];
  readonly templateUnsafeNoEscape?: boolean;
  readonly renameStrategy?: string;
  readonly impactStrategy?: string;
  readonly summaryStrategy?: string;
  readonly filterType?: string[];
  readonly filterPath?: string[];
  readonly filterGroup?: string[];
  readonly filterImpact?: string[];
  readonly filterKind?: string[];
  readonly mode?: string;
  readonly summary?: boolean;
  readonly verbose?: boolean;
  readonly why?: boolean;
  readonly diffContext?: string;
  readonly topRisks?: string;
  readonly onlyBreaking?: boolean;
  readonly failOnBreaking?: boolean;
  readonly failOnChanges?: boolean;
  readonly links?: boolean;
  readonly quiet?: boolean;
}

export interface ResolveCompareCommandInput {
  readonly previous: string | undefined;
  readonly next: string | undefined;
  readonly options: CommanderCompareOptions;
  readonly defaults: ResolveCompareDefaults;
  readonly linksExplicit: boolean;
}

export interface ResolvedCompareCommand {
  readonly options: CompareCommandOptions;
  readonly sources: SessionTokenSources;
}

export const resolveCompareCommand = (
  input: ResolveCompareCommandInput,
): ResolvedCompareCommand => {
  const format = normalizeFormat(input.options.format);
  const outputPath = normalizeString(input.options.output);
  const templatePath = normalizeString(input.options.template);
  const templatePartials = parseTemplatePartials(input.options.templatePartial);
  const templateAllowUnescapedOutput =
    normalizeBoolean(input.options.templateUnsafeNoEscape) ?? false;
  const renameStrategy = normalizeString(input.options.renameStrategy);
  const impactStrategy = normalizeString(input.options.impactStrategy);
  const summaryStrategy = normalizeString(input.options.summaryStrategy);

  const filterTypes = parseDelimitedList(input.options.filterType);
  const filterPaths = parseDelimitedList(input.options.filterPath);
  const filterGroups = parseDelimitedList(input.options.filterGroup);
  const filterImpacts = parseImpactList(parseDelimitedList(input.options.filterImpact));
  const filterKinds = parseKindList(parseDelimitedList(input.options.filterKind));

  const summary = normalizeBoolean(input.options.summary) ?? false;
  const modeOption = normalizeMode(input.options.mode);
  const onlyBreaking = normalizeBoolean(input.options.onlyBreaking) ?? false;
  const failOnBreaking = normalizeBoolean(input.options.failOnBreaking) ?? false;
  const failOnChanges = normalizeBoolean(input.options.failOnChanges) ?? false;
  const verbose = normalizeBoolean(input.options.verbose) ?? false;
  const why = normalizeBoolean(input.options.why) ?? false;
  const quiet = normalizeBoolean(input.options.quiet) ?? false;

  const diffContext =
    parsePositiveInteger(input.options.diffContext, '--diff-context', { allowZero: true }) ??
    DEFAULT_DIFF_CONTEXT;
  const topRisks =
    parsePositiveInteger(input.options.topRisks, '--top-risks', { allowZero: true }) ??
    DEFAULT_TOP_RISK_LIMIT;

  const unicode = normalizeBoolean(input.options.unicode);
  const colorOption = typeof input.options.color === 'boolean' ? input.options.color : undefined;
  const defaultColor = input.defaults.color ?? false;
  const color = colorOption ?? defaultColor;

  const defaultLinks = input.defaults.links ?? false;
  const links = input.linksExplicit ? input.options.links !== false : defaultLinks;

  const usesOnlyBreakingImpact = filterImpacts.length === 1 && filterImpacts[0] === 'breaking';

  if (onlyBreaking && filterImpacts.length > 0 && !usesOnlyBreakingImpact) {
    throw new TypeError(
      '--only-breaking cannot be combined with --filter-impact values other than "breaking"',
    );
  }

  if (summary && modeOption && modeOption !== 'summary') {
    throw new TypeError('--summary cannot be combined with --mode values other than "summary"');
  }

  const impacts: TokenChangeImpact[] = onlyBreaking ? ['breaking'] : [...filterImpacts];

  let mode: 'full' | 'summary' | 'condensed' = 'condensed';

  if (modeOption) {
    mode = modeOption;
  } else if (summary) {
    mode = 'summary';
  }

  const resolvedOptions: CompareCommandOptions = {
    format,
    color,
    templatePartials,
    templateAllowUnescapedOutput,
    filterTypes,
    filterPaths,
    filterGroups,
    filterImpacts: impacts,
    filterKinds,
    mode,
    failOnBreaking,
    failOnChanges,
    verbose,
    why,
    diffContext,
    topRisks,
    links,
    quiet,
    ...(unicode === undefined ? {} : { unicode }),
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(templatePath === undefined ? {} : { templatePath }),
    ...(renameStrategy === undefined ? {} : { renameStrategy }),
    ...(impactStrategy === undefined ? {} : { impactStrategy }),
    ...(summaryStrategy === undefined ? {} : { summaryStrategy }),
  };

  const sources = resolveCompareSources(input.previous, input.next, resolvedOptions);

  return { options: resolvedOptions, sources };
};

const DEFAULT_DIFF_CONTEXT = 3;
const DEFAULT_TOP_RISK_LIMIT = 5;

const normalizeFormat = (value: string | undefined): OutputFormat => {
  if (!value) {
    return 'cli';
  }

  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case 'json': {
      return normalized;
    }
    case 'markdown': {
      return normalized;
    }
    case 'html': {
      return normalized;
    }
    case 'yaml': {
      return normalized;
    }
    case 'cli': {
      return normalized;
    }
    case 'sarif': {
      return normalized;
    }
    case 'template': {
      return normalized;
    }
    default: {
      return 'cli';
    }
  }
};

const normalizeString = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseDelimitedList = (values: readonly string[] | undefined): readonly string[] => {
  if (!values || values.length === 0) {
    return [];
  }

  const segments: string[] = [];

  for (const entry of values) {
    const normalized = entry?.trim();

    if (!normalized) {
      continue;
    }

    for (const part of normalized.split(',')) {
      const segment = part.trim();

      if (segment.length > 0) {
        segments.push(segment);
      }
    }
  }

  return segments;
};

const parseImpactList = (values: readonly string[]): readonly TokenChangeImpact[] => {
  if (values.length === 0) {
    return [];
  }

  const set = new Set<TokenChangeImpact>();

  for (const value of values) {
    const normalized = value.trim().toLowerCase();

    if (normalized.length === 0) {
      continue;
    }

    if (normalized === 'breaking') {
      set.add('breaking');
      continue;
    }

    if (normalized === 'non-breaking' || normalized === 'nonbreaking') {
      set.add('non-breaking');
      continue;
    }

    throw new TypeError(`Unknown impact filter: ${value}`);
  }

  return [...set];
};

const parseKindList = (values: readonly string[]): readonly TokenChangeKind[] => {
  if (values.length === 0) {
    return [];
  }

  const set = new Set<TokenChangeKind>();

  for (const value of values) {
    const normalized = value.trim().toLowerCase();

    if (normalized.length === 0) {
      continue;
    }

    if (
      normalized === 'added' ||
      normalized === 'add' ||
      normalized === 'addition' ||
      normalized === 'additions'
    ) {
      set.add('added');
      continue;
    }

    if (
      normalized === 'removed' ||
      normalized === 'remove' ||
      normalized === 'removal' ||
      normalized === 'removals'
    ) {
      set.add('removed');
      continue;
    }

    if (
      normalized === 'changed' ||
      normalized === 'change' ||
      normalized === 'changes' ||
      normalized === 'modified' ||
      normalized === 'modification' ||
      normalized === 'modifications'
    ) {
      set.add('changed');
      continue;
    }

    if (
      normalized === 'renamed' ||
      normalized === 'rename' ||
      normalized === 'renames' ||
      normalized === 'renaming'
    ) {
      set.add('renamed');
      continue;
    }

    throw new TypeError(`Unknown change kind filter: ${value}`);
  }

  return [...set];
};

const normalizeBoolean = (value: boolean | undefined): boolean | undefined => {
  return typeof value === 'boolean' ? value : undefined;
};

const normalizeMode = (value: string | undefined): 'full' | 'summary' | 'condensed' | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'full' || normalized === 'summary' || normalized === 'condensed') {
    return normalized;
  }

  if (normalized === 'detailed') {
    return 'full';
  }

  throw new TypeError('--mode must be one of "condensed", "full", or "summary"');
};

const parsePositiveInteger = (
  value: string | undefined,
  flagName: string,
  options: {
    readonly allowZero?: boolean;
  } = {},
): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    throw new TypeError(`${flagName} must be a positive integer`);
  }

  if (options.allowZero === true) {
    if (parsed < 0) {
      throw new TypeError(`${flagName} must be a non-negative integer`);
    }

    return parsed;
  }

  if (parsed <= 0) {
    throw new TypeError(`${flagName} must be a positive integer`);
  }

  return parsed;
};

const parseTemplatePartials = (
  values: readonly string[] | undefined,
): TemplatePartialDefinition[] => {
  if (!values || values.length === 0) {
    return [];
  }

  const parsed: TemplatePartialDefinition[] = [];

  for (const entry of values) {
    const normalized = entry?.trim();

    if (!normalized) {
      continue;
    }

    if (!normalized.includes('=')) {
      throw new TypeError('--template-partial must be defined as <name>=<path>');
    }

    const separatorIndex = normalized.indexOf('=');
    const name = normalized.slice(0, separatorIndex).trim();
    const path = normalized.slice(separatorIndex + 1).trim();

    if (name.length === 0) {
      throw new TypeError('--template-partial must include a non-empty name');
    }

    if (path.length === 0) {
      throw new TypeError('--template-partial must include a non-empty path');
    }

    parsed.push({ name, path });
  }

  return parsed;
};

const resolveCompareSources = (
  previousArg: string | undefined,
  nextArg: string | undefined,
  _options: CompareCommandOptions,
): SessionTokenSources => {
  const previous = requireValue(previousArg, 'compare requires a previous token document path');

  const next = requireValue(nextArg, 'compare requires a next token document path');

  return {
    previous: { kind: 'file', target: previous },
    next: { kind: 'file', target: next },
  } satisfies SessionTokenSources;
};

const requireValue = (value: string | undefined, message: string): string => {
  if (!value) {
    throw new TypeError(message);
  }

  return value;
};
