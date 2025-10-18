import process from 'node:process';

import type { Command } from 'commander';
import type { BuildRunResult } from '@dtifx/build';

import type { CliIo } from '../../io/cli-io.js';
import { resolveBuildGlobalOptions } from './options.js';
import { prepareBuildEnvironment } from './environment.js';
import { loadBuildModule, loadBuildReporterModule } from './build-module.js';

export interface ExecuteBuildInspectCommandOptions {
  readonly command: Command;
  readonly io: CliIo;
}

interface InspectCommandOptions {
  readonly pointer?: string;
  readonly type?: string;
  readonly json: boolean;
}

interface FilteredTokenEntry {
  readonly snapshot: BuildRunResult['tokens'][number];
  readonly transforms: Map<string, unknown>;
  readonly value: unknown;
}

export const executeBuildInspectCommand = async ({
  command,
  io,
}: ExecuteBuildInspectCommandOptions): Promise<void> => {
  const options = resolveBuildGlobalOptions(command);
  const inspectOptions = resolveInspectCommandOptions(command);
  const build = await loadBuildModule(io);
  if (!build) {
    process.exitCode = 1;
    return;
  }

  const reporters = await loadBuildReporterModule(io);
  if (!reporters) {
    process.exitCode = 1;
    return;
  }

  const environment = await prepareBuildEnvironment(options, io, undefined, undefined, {
    build,
    reporters,
  });
  if (!environment) {
    process.exitCode = 1;
    return;
  }

  const reporter = reporters.createReporter({
    format: options.reporter ?? 'human',
    logger: environment.logger,
    includeTimings: options.timings,
    stdout: { write: (line: string) => io.writeOut(line) },
    stderr: { write: (line: string) => io.writeErr(line) },
    cwd: process.cwd(),
  });

  const span = environment.telemetry.tracer.startSpan('dtifx.cli.inspect', {
    attributes: {
      reporter: reporter.format,
      output: inspectOptions.json ? 'json' : 'human',
    },
  });

  const telemetrySubscription = environment.services.eventBus.subscribe(
    build.createBuildStageTelemetryEventSubscriber({ getSpan: () => span }),
  );

  try {
    const result = await build.executeBuild(
      environment.services,
      environment.loaded.config,
      environment.telemetry.tracer,
      { parentSpan: span, includeFormatters: false },
    );

    const filtered = filterTokens(result, inspectOptions);
    span.end({ attributes: { matchCount: filtered.length } });

    if (inspectOptions.json) {
      const payload = filtered.map((entry) => ({
        pointer: entry.snapshot.pointer,
        type: entry.snapshot.token.type ?? undefined,
        value: entry.value,
        metadata: entry.snapshot.metadata ?? undefined,
        transforms: Object.fromEntries(entry.transforms.entries()),
        provenance: entry.snapshot.provenance,
      }));

      io.writeOut(`${JSON.stringify({ tokens: payload }, undefined, 2)}\n`);
      return;
    }

    if (filtered.length === 0) {
      io.writeOut('No tokens matched the provided filters.\n');
      return;
    }

    for (const entry of filtered) {
      io.writeOut(`${entry.snapshot.pointer} (${entry.snapshot.token.type ?? 'unknown'})\n`);
      io.writeOut(`  value: ${JSON.stringify(entry.value)}\n`);

      if (entry.transforms.size > 0) {
        io.writeOut('  transforms:\n');

        for (const [name, value] of entry.transforms) {
          io.writeOut(`    ${name}: ${JSON.stringify(value)}\n`);
        }
      }

      io.writeOut(`  source: ${entry.snapshot.provenance.uri}\n`);
    }
  } catch (error) {
    span.end({ status: 'error' });
    reporter.buildFailure(error);
    process.exitCode = 1;
  } finally {
    telemetrySubscription.unsubscribe();
    environment.dispose();
    await environment.telemetry.exportSpans();
  }
};

const resolveInspectCommandOptions = (command: Command): InspectCommandOptions => {
  const options = command.optsWithGlobals<Record<string, unknown>>();

  return {
    json: Boolean(options['json']),
    ...(options['pointer'] === undefined ? {} : { pointer: options['pointer'] as string }),
    ...(options['type'] === undefined ? {} : { type: options['type'] as string }),
  } satisfies InspectCommandOptions;
};

const filterTokens = (
  result: BuildRunResult,
  inspect: InspectCommandOptions,
): readonly FilteredTokenEntry[] => {
  const transformMap = groupTransformResults(result.transforms);
  const filtered = result.tokens.filter((snapshot) => {
    if (inspect.pointer && !snapshot.pointer.startsWith(inspect.pointer)) {
      return false;
    }

    if (inspect.type && snapshot.token.type !== inspect.type) {
      return false;
    }

    return true;
  });

  return filtered.map((snapshot) => {
    const transforms = transformMap.get(snapshot.pointer) ?? new Map<string, unknown>();
    const value =
      snapshot.resolution?.value ?? snapshot.token.value ?? snapshot.token.raw ?? undefined;

    return { snapshot, transforms, value } satisfies FilteredTokenEntry;
  });
};

const groupTransformResults = (
  results: BuildRunResult['transforms'],
): Map<string, Map<string, unknown>> => {
  const grouped = new Map<string, Map<string, unknown>>();

  for (const result of results) {
    const pointer = typeof result.pointer === 'string' ? result.pointer : String(result.pointer);
    const transform = result.transform;
    if (!grouped.has(pointer)) {
      grouped.set(pointer, new Map([[transform, result.output]]));
      continue;
    }

    grouped.get(pointer)?.set(transform, result.output);
  }

  return grouped;
};
