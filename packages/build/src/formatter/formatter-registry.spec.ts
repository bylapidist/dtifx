import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FormatterRegistry,
  FormatterEngine,
  createFormatterExecutionContext,
  runFormatterDefinition,
  type FormatterDefinition,
  type FormatterExecutionContext,
} from './formatter-registry.js';
import type { BuildTokenSnapshot } from '../domain/models/tokens.js';
import type { TransformResult } from '../transform/transform-registry.js';

const { matchesTokenSelector } = vi.hoisted(() => ({
  matchesTokenSelector: vi.fn(),
}));

vi.mock('@dtifx/core/policy/selectors', () => ({
  matchesTokenSelector,
}));

const createSnapshot = (overrides: Partial<BuildTokenSnapshot>): BuildTokenSnapshot =>
  ({
    pointer: '/token',
    token: { value: 'value' },
    ...overrides,
  }) as BuildTokenSnapshot;

const createTransformResult = (overrides: Partial<TransformResult>): TransformResult => ({
  pointer: '/token',
  transform: 'transform',
  output: 'output',
  snapshot: {} as never,
  group: 'default',
  optionsHash: 'hash',
  cacheStatus: 'hit' as never,
  ...overrides,
});

describe('FormatterRegistry', () => {
  beforeEach(() => {
    matchesTokenSelector.mockReset();
  });

  it('registers formatter definitions and returns them in sorted order', () => {
    const first: FormatterDefinition = {
      name: 'b.formatter',
      selector: {} as FormatterDefinition['selector'],
      run: vi.fn(),
    };
    const second: FormatterDefinition = {
      name: 'a.formatter',
      selector: {} as FormatterDefinition['selector'],
      run: vi.fn(),
    };

    const registry = new FormatterRegistry([first, second]);

    expect(registry.list().map((definition) => definition.name)).toEqual([
      'a.formatter',
      'b.formatter',
    ]);

    expect(() => registry.register({ ...first })).toThrow(
      'Formatter with name "b.formatter" is already registered.',
    );
  });

  it('retrieves formatter definitions by name', () => {
    const definition: FormatterDefinition = {
      name: 'example.formatter',
      selector: {} as FormatterDefinition['selector'],
      run: vi.fn(),
    };

    const registry = new FormatterRegistry();
    registry.register(definition);

    expect(registry.get('example.formatter')).toBe(definition);
    expect(registry.get('missing.formatter')).toBeUndefined();
  });
});

describe('createFormatterExecutionContext', () => {
  it('sorts snapshots and groups transform results by pointer', () => {
    const snapshots: readonly BuildTokenSnapshot[] = [
      createSnapshot({ pointer: '/tokens/b', token: { value: 'b' } as never }),
      createSnapshot({ pointer: '/tokens/a', token: { value: 'a' } as never }),
    ];
    const results: readonly TransformResult[] = [
      createTransformResult({ pointer: '/tokens/a', transform: 'alpha', output: 'A' }),
      createTransformResult({ pointer: '/tokens/b', transform: 'beta', output: 'B' }),
      createTransformResult({ pointer: '/tokens/a', transform: 'gamma', output: 'G' }),
    ];

    const context = createFormatterExecutionContext(snapshots, results);

    expect(context.snapshots.map((snapshot) => snapshot.pointer)).toEqual([
      '/tokens/a',
      '/tokens/b',
    ]);
    const transforms = context.transforms;
    expect([...transforms.keys()]).toEqual(['/tokens/a', '/tokens/b']);
    expect(transforms.get('/tokens/a')?.get('alpha')).toBe('A');
    expect(transforms.get('/tokens/a')?.get('gamma')).toBe('G');
    expect(transforms.get('/tokens/b')?.get('beta')).toBe('B');
  });
});

describe('runFormatterDefinition', () => {
  beforeEach(() => {
    matchesTokenSelector.mockReset();
  });

  it('filters tokens using selectors and required transforms', async () => {
    const snapshots: readonly BuildTokenSnapshot[] = [
      createSnapshot({
        pointer: '/tokens/one',
        token: { value: 'resolved', raw: 'raw', type: 'color' } as never,
        metadata: { source: 'meta' } as never,
      }),
      createSnapshot({ pointer: '/tokens/two', token: { value: 'ignored' } as never }),
    ];
    const context = {
      snapshots,
      transforms: new Map([
        ['/tokens/one', new Map([['alpha', 'A']])],
        ['/tokens/two', new Map([['beta', 'B']])],
      ]),
    } as const;

    matchesTokenSelector.mockImplementation((snapshot) => snapshot.pointer === '/tokens/one');

    const run = vi.fn(async ({ tokens }) =>
      tokens.map((token) => ({
        path: `${token.pointer}.txt`,
        contents: token.value,
        encoding: 'utf8',
        metadata: token.metadata,
      })),
    );

    const definition: FormatterDefinition = {
      name: 'example.formatter',
      selector: { transforms: ['alpha'] } as FormatterDefinition['selector'],
      run,
    };

    const artifacts = await runFormatterDefinition(definition, context);

    expect(run).toHaveBeenCalledWith({
      tokens: [
        expect.objectContaining({
          pointer: '/tokens/one',
          value: 'resolved',
          raw: 'raw',
          type: 'color',
          metadata: { source: 'meta' },
        }),
      ],
    });
    expect(artifacts).toEqual([
      {
        path: '/tokens/one.txt',
        contents: 'resolved',
        encoding: 'utf8',
        metadata: { source: 'meta' },
      },
    ]);
  });

  it('returns an empty array when no tokens satisfy the selector', async () => {
    const context = {
      snapshots: [createSnapshot({ pointer: '/tokens/one' })],
      transforms: new Map([['/tokens/one', new Map<string, unknown>()]]),
    } as const;

    matchesTokenSelector.mockReturnValue(false);

    const definition: FormatterDefinition = {
      name: 'example.formatter',
      selector: {} as FormatterDefinition['selector'],
      run: vi.fn(),
    };

    const artifacts = await runFormatterDefinition(definition, context);

    expect(artifacts).toEqual([]);
    expect(definition.run).not.toHaveBeenCalled();
  });

  it('skips tokens when required transforms are missing', async () => {
    const context = {
      snapshots: [createSnapshot({ pointer: '/tokens/one' })],
      transforms: new Map([['/tokens/one', new Map([['alpha', 'A']])]]),
    } as const;

    matchesTokenSelector.mockReturnValue(true);

    const definition: FormatterDefinition = {
      name: 'example.formatter',
      selector: { transforms: ['alpha', 'beta'] } as FormatterDefinition['selector'],
      run: vi.fn(),
    };

    const artifacts = await runFormatterDefinition(definition, context);

    expect(artifacts).toEqual([]);
    expect(definition.run).not.toHaveBeenCalled();
  });

  it('sorts formatter artifacts by file path', async () => {
    const context = {
      snapshots: [createSnapshot({ pointer: '/tokens/one' })],
      transforms: new Map([
        [
          '/tokens/one',
          new Map([
            ['alpha', 'A'],
            ['beta', 'B'],
          ]),
        ],
      ]),
    } as const;

    matchesTokenSelector.mockReturnValue(true);

    const run = vi.fn(async () => [
      { path: 'b.txt', contents: 'two', encoding: 'utf8' as const },
      { path: 'a.txt', contents: 'one', encoding: 'utf8' as const },
    ]);

    const definition: FormatterDefinition = {
      name: 'example.formatter',
      selector: {} as FormatterDefinition['selector'],
      run,
    };

    const artifacts = await runFormatterDefinition(definition, context);

    expect(artifacts.map((artifact) => artifact.path)).toEqual(['a.txt', 'b.txt']);
  });
});

describe('FormatterEngine', () => {
  beforeEach(() => {
    matchesTokenSelector.mockReset();
  });

  it('exposes the registry supplied at construction', () => {
    const registry = new FormatterRegistry();
    const engine = new FormatterEngine({ registry });

    expect(engine.getRegistry()).toBe(registry);
  });

  it('returns no artifacts when no formatters are registered', async () => {
    const engine = new FormatterEngine();
    const artifacts = await engine.runWithContext({
      snapshots: [],
      transforms: new Map(),
    } as FormatterExecutionContext);

    expect(artifacts).toEqual([]);
  });

  it('delegates run to createContext and runWithContext', async () => {
    const engine = new FormatterEngine();
    const context = {
      snapshots: [],
      transforms: new Map(),
    } as FormatterExecutionContext;
    const createContextSpy = vi.spyOn(engine, 'createContext').mockReturnValue(context);
    const runWithContextSpy = vi.spyOn(engine, 'runWithContext').mockResolvedValue([]);

    const artifacts = await engine.run([], []);

    expect(artifacts).toEqual([]);
    expect(createContextSpy).toHaveBeenCalledWith([], []);
    expect(runWithContextSpy).toHaveBeenCalledWith(context);
  });

  it('executes registered formatters and sorts their outputs', async () => {
    const snapshots = [
      createSnapshot({ pointer: '/tokens/one', token: { value: 'value' } as never }),
    ];
    const context: FormatterExecutionContext = {
      snapshots,
      transforms: new Map([['/tokens/one', new Map<string, unknown>([['alpha', 'A']])]]),
    };
    matchesTokenSelector.mockReturnValue(true);

    const first: FormatterDefinition = {
      name: 'b.formatter',
      selector: {} as FormatterDefinition['selector'],
      run: vi.fn(async ({ tokens }) => [
        {
          path: 'b.txt',
          contents: tokens[0]!.value as string,
          encoding: 'utf8' as const,
        },
      ]),
    };
    const second: FormatterDefinition = {
      name: 'a.formatter',
      selector: {} as FormatterDefinition['selector'],
      run: vi.fn(async () => [
        { path: 'c.txt', contents: 'c', encoding: 'utf8' as const },
        { path: 'a.txt', contents: 'a', encoding: 'utf8' as const },
      ]),
    };

    const registry = new FormatterRegistry([first, second]);
    const engine = new FormatterEngine({ registry });

    const artifacts = await engine.runWithContext(context);

    expect(first.run).toHaveBeenCalledTimes(1);
    expect(second.run).toHaveBeenCalledTimes(1);
    expect(artifacts.map((artifact) => artifact.path)).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });
});
