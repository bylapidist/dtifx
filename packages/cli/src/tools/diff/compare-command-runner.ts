import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

import type * as DiffModuleExports from '@dtifx/diff';
import type { RenderReportOptions, ReportRunContext } from '@dtifx/diff';
import { CommanderError, type Command } from 'commander';

import type { CliIo } from '../../io/cli-io.js';
import {
  resolveCompareCommand,
  type CompareCommandOptions,
  type CommanderCompareOptions,
  type ResolveCompareDefaults,
} from './compare-options.js';
import {
  createDiagnosticSink,
  createReportingDiagnosticsPort,
  selectDiagnosticDecorator,
} from './diagnostics.js';
import { formatFailureMessage } from './failures.js';
import { loadDiffStrategies } from './strategies.js';

export interface ExecuteDiffCompareCommandOptions {
  readonly previous: string | undefined;
  readonly next: string | undefined;
  readonly command: Command;
  readonly io: CliIo;
}

type DiffModule = typeof DiffModuleExports;
type DiffModuleImporter = () => Promise<DiffModule>;

let diffModulePromise: Promise<DiffModule> | undefined;
let importDiffModule: DiffModuleImporter = () => import('@dtifx/diff');

const loadDiffModule = async (io: CliIo): Promise<DiffModule | undefined> => {
  if (!diffModulePromise) {
    diffModulePromise = importDiffModule();
  }

  try {
    return await diffModulePromise;
  } catch (error) {
    diffModulePromise = undefined;

    if (isModuleNotFoundError(error)) {
      io.writeErr('The "@dtifx/diff" package is required. Please install @dtifx/diff.\n');
      return;
    }

    throw error;
  }
};

export const executeDiffCompareCommand = async ({
  previous,
  next,
  command,
  io,
}: ExecuteDiffCompareCommandOptions): Promise<void> => {
  const diff = await loadDiffModule(io);
  if (!diff) {
    process.exitCode = 1;
    return;
  }
  const rawOptions = command.opts() as CommanderCompareOptions;
  const defaults: ResolveCompareDefaults = {
    color: detectColorPreference(io),
    links: diff.supportsCliHyperlinks(),
  };

  const { options, sources } = resolveCompareCommand({
    previous,
    next,
    options: normalizeCommanderOptions(rawOptions),
    defaults,
    linksExplicit: command.getOptionValueSource('links') === 'cli',
  });

  const startedAt = new Date();
  const startedAtTicks = process.hrtime.bigint();

  const parserDiagnostics = createDiagnosticSink(options, io);
  const reportingDiagnostics = createReportingDiagnosticsPort(options, io);

  const diffStrategies = await loadDiffStrategies({
    ...(options.renameStrategy === undefined ? {} : { renameStrategy: options.renameStrategy }),
    ...(options.impactStrategy === undefined ? {} : { impactStrategy: options.impactStrategy }),
    ...(options.summaryStrategy === undefined ? {} : { summaryStrategy: options.summaryStrategy }),
  });

  const tokenSource = diff.createSessionTokenSourcePort(sources, {
    onDiagnostic: parserDiagnostics,
    warn: parserDiagnostics,
  });

  const session = await diff.runDiffSession(
    {
      tokenSource,
      diagnostics: reportingDiagnostics,
    },
    {
      filter: {
        types: options.filterTypes,
        paths: options.filterPaths,
        groups: options.filterGroups,
        impacts: options.filterImpacts,
        kinds: options.filterKinds,
      },
      failure: {
        failOnBreaking: options.failOnBreaking,
        failOnChanges: options.failOnChanges,
      },
      ...(diffStrategies === undefined ? {} : { diff: diffStrategies }),
    },
  );

  const filteredDiff = session.filteredDiff;
  const durationNs = process.hrtime.bigint() - startedAtTicks;
  const durationMs = Number(durationNs) / 1_000_000;
  const runContext = diff.createRunContext({
    sources,
    startedAt,
    durationMs,
  });

  const renderOptions = await buildRenderOptions(options, runContext);
  const renderedReport = await diff.renderReport(filteredDiff, renderOptions, {
    diagnostics: reportingDiagnostics,
  });
  const output = `${renderedReport}\n`;

  if (options.outputPath) {
    await writeFile(options.outputPath, output, 'utf8');
  } else {
    io.writeOut(output);
  }

  const failure = session.failure;

  if (failure.shouldFail) {
    const decorateMessage = selectDiagnosticDecorator(options.color);
    const message = decorateMessage(formatFailureMessage(failure), 'error');
    io.writeErr(`${message}\n`);
    throw new CommanderError(1, 'diff:compare', '');
  }
};

const isModuleNotFoundError = (error: unknown): error is NodeJS.ErrnoException =>
  Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND',
  );

export const __testing = {
  setDiffModuleImporter(importer?: DiffModuleImporter) {
    importDiffModule = importer ?? (() => import('@dtifx/diff'));
    diffModulePromise = undefined;
  },
};

const detectColorPreference = (io: CliIo): boolean => {
  const stdout = io.stdout as { readonly isTTY?: boolean };
  return Boolean(stdout?.isTTY);
};

const normalizeCommanderOptions = (options: CommanderCompareOptions): CommanderCompareOptions => {
  return {
    ...options,
    templatePartial: options.templatePartial ?? [],
    filterType: options.filterType ?? [],
    filterPath: options.filterPath ?? [],
    filterGroup: options.filterGroup ?? [],
    filterImpact: options.filterImpact ?? [],
    filterKind: options.filterKind ?? [],
  };
};

const buildRenderOptions = async (
  options: CompareCommandOptions,
  runContext: ReportRunContext,
): Promise<RenderReportOptions> => {
  switch (options.format) {
    case 'json': {
      return {
        format: 'json',
        mode: options.mode,
        topRisks: options.topRisks,
        runContext,
      } satisfies RenderReportOptions;
    }
    case 'yaml': {
      return {
        format: 'yaml',
        mode: options.mode,
        topRisks: options.topRisks,
        runContext,
      } satisfies RenderReportOptions;
    }
    case 'markdown': {
      return {
        format: 'markdown',
        mode: options.mode,
        topRisks: options.topRisks,
        showWhy: options.why,
        diffContext: options.diffContext,
        runContext,
      } satisfies RenderReportOptions;
    }
    case 'html': {
      return {
        format: 'html',
        mode: options.mode,
        topRisks: options.topRisks,
        showWhy: options.why,
        diffContext: options.diffContext,
        runContext,
      } satisfies RenderReportOptions;
    }
    case 'sarif': {
      return { format: 'sarif', runContext } satisfies RenderReportOptions;
    }
    case 'template': {
      if (!options.templatePath) {
        throw new Error('--template is required when --format template');
      }

      const template = await readFile(options.templatePath, 'utf8');
      const partialEntries = await Promise.all(
        options.templatePartials.map(async (partial) => {
          const content = await readFile(partial.path, 'utf8');
          return [partial.name, content] as const;
        }),
      );
      const partials = partialEntries.length > 0 ? Object.fromEntries(partialEntries) : undefined;

      return {
        format: 'template',
        template,
        ...(partials === undefined ? {} : { partials }),
        mode: options.mode,
        topRisks: options.topRisks,
        runContext,
        ...(options.templateAllowUnescapedOutput
          ? { allowUnescapedOutput: options.templateAllowUnescapedOutput }
          : {}),
      } satisfies RenderReportOptions;
    }
    default: {
      return {
        format: 'cli',
        color: options.color,
        mode: options.mode,
        verbose: options.verbose,
        showWhy: options.why,
        diffContext: options.diffContext,
        topRisks: options.topRisks,
        links: options.links,
        ...(options.unicode === undefined ? {} : { unicode: options.unicode }),
        runContext,
      } satisfies RenderReportOptions;
    }
  }
};
