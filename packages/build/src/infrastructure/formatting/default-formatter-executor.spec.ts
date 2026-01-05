import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultFormatterExecutor } from './default-formatter-executor.js';
import type { FormatterExecutorRequest, FormatterPlan } from '../../domain/ports/formatters.js';
import type { FormatterDefinition } from '../../formatter/formatter-registry.js';
import type * as FormatterRegistryModule from '../../formatter/formatter-registry.js';

vi.mock('../../formatter/formatter-registry.js', async (importOriginal) => {
  const actual: typeof FormatterRegistryModule = await importOriginal();
  return {
    ...actual,
    createFormatterExecutionContext: vi.fn(() => ({
      snapshots: [],
      transforms: new Map(),
    })),
    runFormatterDefinition: vi.fn(),
  };
});

const registryModule =
  (await import('../../formatter/formatter-registry.js')) as typeof FormatterRegistryModule;
const mockedCreateContext = vi.mocked(registryModule.createFormatterExecutionContext);
const mockedRunDefinition = vi.mocked(registryModule.runFormatterDefinition);

const baseDefinition: FormatterDefinition = {
  name: 'example',
  selector: {} as FormatterDefinition['selector'],
  run: vi.fn(),
};

const createPlan = (overrides: Partial<FormatterPlan> = {}): FormatterPlan => ({
  id: 'example#0',
  name: 'example',
  definition: baseDefinition,
  output: {},
  ...overrides,
});

const createRequest = (
  overrides: Partial<FormatterExecutorRequest> = {},
): FormatterExecutorRequest => ({
  plans: [],
  snapshots: [],
  transforms: [],
  ...overrides,
});

describe('DefaultFormatterExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty executions when no plans are supplied', async () => {
    const executor = new DefaultFormatterExecutor();
    const request = createRequest();

    const result = await executor.execute(request);

    expect(result).toStrictEqual({ executions: [], artifacts: [] });
    expect(mockedCreateContext).not.toHaveBeenCalled();
    expect(mockedRunDefinition).not.toHaveBeenCalled();
  });

  it('creates a shared execution context for formatter plans', async () => {
    const executor = new DefaultFormatterExecutor();
    const plan = createPlan();
    const request = createRequest({ plans: [plan] });
    const context = { snapshots: ['snapshot'], transforms: new Map() } as never;
    mockedCreateContext.mockReturnValueOnce(context);
    mockedRunDefinition.mockResolvedValueOnce([]);

    await executor.execute(request);

    expect(mockedCreateContext).toHaveBeenCalledWith(request.snapshots, request.transforms);
    expect(mockedRunDefinition).toHaveBeenCalledWith(plan.definition, context);
  });

  it('enriches formatter artifacts with metadata and skips empty results', async () => {
    const executor = new DefaultFormatterExecutor();
    const firstPlan = createPlan({ id: 'formatter#0', name: 'formatter' });
    const secondPlan = createPlan({ id: 'formatter#1', name: 'formatter' });
    mockedRunDefinition
      .mockResolvedValueOnce([
        {
          path: 'out.txt',
          contents: 'first',
          encoding: 'utf8',
          metadata: Object.freeze({ source: 'test' }),
        },
        {
          path: 'other.txt',
          contents: 'second',
          encoding: 'utf8',
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await executor.execute(createRequest({ plans: [firstPlan, secondPlan] }));

    expect(result.executions).toHaveLength(1);
    const [execution] = result.executions;
    expect(execution.id).toBe('formatter#0');
    expect(execution.artifacts).toHaveLength(2);
    const [firstArtifact, secondArtifact] = execution.artifacts;
    expect(firstArtifact.metadata).toStrictEqual({
      source: 'test',
      formatter: 'formatter',
      formatterInstance: 'formatter#0',
    });
    expect(secondArtifact.metadata).toStrictEqual({
      formatter: 'formatter',
      formatterInstance: 'formatter#0',
    });
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts[0]).not.toBe(result.artifacts[1]);
  });

  it('does not mutate original artifact metadata objects', async () => {
    const executor = new DefaultFormatterExecutor();
    const metadata = Object.freeze({ existing: true });
    const plan = createPlan({ id: 'formatter#0', name: 'formatter' });
    mockedRunDefinition.mockResolvedValueOnce([
      {
        path: 'artifact.json',
        contents: '{}',
        encoding: 'utf8',
        metadata,
      },
    ]);

    const result = await executor.execute(createRequest({ plans: [plan] }));

    const enriched = result.artifacts[0];
    expect(enriched.metadata).not.toBe(metadata);
    expect(enriched.metadata).toStrictEqual({
      existing: true,
      formatter: 'formatter',
      formatterInstance: 'formatter#0',
    });
  });
});
