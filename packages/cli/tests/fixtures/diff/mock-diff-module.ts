export interface MockRunContext {
  readonly sources: unknown;
  readonly startedAt: Date;
  readonly durationMs: number;
}

export const supportsCliHyperlinks = (): boolean => false;

export const createSessionTokenSourcePort = (_sources: unknown, _options: unknown): object => {
  return {};
};

export const runDiffSession = async (): Promise<{
  readonly filteredDiff: string;
  readonly failure: { readonly shouldFail: boolean };
}> => {
  return {
    filteredDiff: 'mock-diff',
    failure: { shouldFail: false },
  };
};

export const createRunContext = (input: MockRunContext): MockRunContext => {
  return input;
};

export const renderReport = async (): Promise<string> => {
  return 'stub-report';
};
