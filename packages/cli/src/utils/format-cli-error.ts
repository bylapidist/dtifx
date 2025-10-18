import { inspect } from 'node:util';

export const formatCliError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return inspect(error, { depth: 4, maxArrayLength: 10 });
};
