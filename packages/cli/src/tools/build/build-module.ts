import type * as BuildModule from '@dtifx/build';
import type * as BuildReporterModule from '@dtifx/build/cli/reporters';

import type { CliIo } from '../../io/cli-io.js';

let buildModulePromise: Promise<typeof BuildModule> | undefined;
let buildReporterModulePromise: Promise<typeof BuildReporterModule> | undefined;
let importBuildModule: () => Promise<typeof BuildModule> = () => import('@dtifx/build');
let importBuildReporterModule: () => Promise<typeof BuildReporterModule> = () =>
  import('@dtifx/build/cli/reporters');

export const loadBuildModule = async (io: CliIo): Promise<typeof BuildModule | undefined> => {
  if (!buildModulePromise) {
    buildModulePromise = importBuildModule();
  }

  try {
    return await buildModulePromise;
  } catch (error) {
    buildModulePromise = undefined;

    if (isModuleNotFoundError(error)) {
      io.writeErr('The "@dtifx/build" package is required. Please install @dtifx/build.\n');
      return;
    }

    throw error;
  }
};

export const loadBuildReporterModule = async (
  io: CliIo,
): Promise<typeof BuildReporterModule | undefined> => {
  if (!buildReporterModulePromise) {
    buildReporterModulePromise = importBuildReporterModule();
  }

  try {
    return await buildReporterModulePromise;
  } catch (error) {
    buildReporterModulePromise = undefined;

    if (isModuleNotFoundError(error)) {
      io.writeErr('The "@dtifx/build" package is required. Please install @dtifx/build.\n');
      return;
    }

    throw error;
  }
};

const isModuleNotFoundError = (error: unknown): error is NodeJS.ErrnoException =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND',
  );

export const setBuildModuleImportersForTesting = (options?: {
  readonly build?: () => Promise<typeof BuildModule>;
  readonly reporters?: () => Promise<typeof BuildReporterModule>;
}): void => {
  importBuildModule = options?.build ?? (() => import('@dtifx/build'));
  importBuildReporterModule = options?.reporters ?? (() => import('@dtifx/build/cli/reporters'));
  buildModulePromise = undefined;
  buildReporterModulePromise = undefined;
};
