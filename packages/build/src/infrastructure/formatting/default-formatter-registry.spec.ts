import { describe, expect, it, vi } from 'vitest';

import type { BuildConfig, FormatterInstanceConfig } from '../../config/index.js';
import { DefaultFormatterRegistry } from './default-formatter-registry.js';
import type { FormatterDefinition } from '../../formatter/formatter-registry.js';
import {
  FormatterDefinitionFactoryRegistry,
  type FormatterDefinitionFactoryContext,
} from '../../formatter/formatter-factory.js';

const baseDefinition: FormatterDefinition = {
  name: 'example.formatter',
  selector: {} as FormatterDefinition['selector'],
  run: vi.fn(),
};

const baseConfig = { name: 'example.formatter', output: {} } as const;

const baseContext: FormatterDefinitionFactoryContext = {
  config: {} as BuildConfig,
};

describe('DefaultFormatterRegistry', () => {
  it('returns an empty plan when no formatters are configured', () => {
    const registry = new DefaultFormatterRegistry({ definitions: [baseDefinition] });
    let formatters: readonly FormatterInstanceConfig[] | undefined;

    expect(registry.plan(formatters)).toStrictEqual([]);
    expect(registry.plan([])).toStrictEqual([]);
  });

  it('creates plans for registered definitions', () => {
    const registry = new DefaultFormatterRegistry({ definitions: [baseDefinition] });

    expect(registry.plan([baseConfig])).toStrictEqual([
      {
        id: 'example.formatter#0',
        name: 'example.formatter',
        definition: baseDefinition,
        output: baseConfig.output,
      },
    ]);
  });

  it('throws when using registered definitions without a match', () => {
    const registry = new DefaultFormatterRegistry({ definitions: [baseDefinition] });

    expect(() => registry.plan([{ name: 'missing.formatter', output: {} }])).toThrow(
      'Formatter "missing.formatter" is not registered.',
    );
  });

  it('builds formatter definitions via registered factories', () => {
    const definition = { ...baseDefinition, name: 'factory.formatter' } as FormatterDefinition;
    const factory = {
      name: 'factory.formatter',
      create: vi.fn(() => definition),
    };
    const registry = new DefaultFormatterRegistry({
      definitionRegistry: new FormatterDefinitionFactoryRegistry([factory]),
      definitionContext: baseContext,
    });

    expect(registry.plan([{ name: 'factory.formatter', output: {} }])).toStrictEqual([
      {
        id: 'factory.formatter#0',
        name: 'factory.formatter',
        definition,
        output: {},
      },
    ]);
    expect(factory.create).toHaveBeenCalledWith(
      { name: 'factory.formatter', output: {} },
      baseContext,
    );
  });

  it('throws when no factory is registered for a formatter', () => {
    const registry = new DefaultFormatterRegistry({
      definitionRegistry: new FormatterDefinitionFactoryRegistry(),
      definitionContext: baseContext,
    });

    expect(() => registry.plan([baseConfig])).toThrow(
      'Formatter "example.formatter" is not registered.',
    );
  });

  it('throws when a factory registry is provided without context', () => {
    const registry = new DefaultFormatterRegistry({
      definitionRegistry: new FormatterDefinitionFactoryRegistry(),
    });

    expect(() => registry.plan([baseConfig])).toThrow(
      'Formatter registry context has not been configured.',
    );
  });
});
