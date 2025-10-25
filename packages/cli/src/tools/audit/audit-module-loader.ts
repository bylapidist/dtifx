import type * as Audit from '@dtifx/audit';

import type { CliIo } from '../../io/cli-io.js';

export interface LoadAuditModuleOptions {
  readonly io: CliIo;
}

export type AuditModule = typeof Audit;

export type LoadAuditModule = (options: LoadAuditModuleOptions) => Promise<AuditModule | undefined>;

type AuditModuleImporter = () => Promise<AuditModule>;

const defaultImportAuditModule: AuditModuleImporter = () => import('@dtifx/audit');

let importAuditModule: AuditModuleImporter = defaultImportAuditModule;

export const setAuditModuleImporterForTesting = (
  importer?: AuditModuleImporter | undefined,
): void => {
  importAuditModule = importer ?? defaultImportAuditModule;
};

export const loadAuditModule: LoadAuditModule = async ({ io }) => {
  try {
    return await importAuditModule();
  } catch (error) {
    if (isModuleNotFoundError(error)) {
      io.writeErr('The "@dtifx/audit" package is required. Please install @dtifx/audit.\n');
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
