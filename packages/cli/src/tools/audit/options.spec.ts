import { describe, expect, it, vi } from 'vitest';

import type { Command as CommanderCommand } from 'commander';

import { registerAuditCliOptions, resolveAuditCliOptions } from './options.js';

type OptionParser = (value: string, previous?: unknown) => unknown;

interface OptionDefinition {
  readonly longFlag: string;
  readonly key: string;
  readonly expectsValue: boolean;
  defaultValue?: unknown;
  parser?: OptionParser;
}

function toOptionKey(flag: string): string {
  const segments = flag.replace(/^--/, '').split('-');
  return segments
    .map((segment, index) =>
      index === 0 ? segment : segment.charAt(0).toUpperCase() + segment.slice(1),
    )
    .join('');
}

function extractLongFlag(flags: string): string {
  const parts = flags.split(',').map((part) => part.trim());
  const longPart = parts.find((part) => part.startsWith('--')) ?? parts[0] ?? flags;
  return longPart.split(/\s+/)[0] ?? longPart;
}

function createOptionDefinition(flags: string, defaultValue?: unknown): OptionDefinition {
  return {
    longFlag: extractLongFlag(flags),
    key: toOptionKey(extractLongFlag(flags)),
    expectsValue: /<[^>]+>|\[[^\]]+\]/.test(flags),
    ...(defaultValue === undefined ? {} : { defaultValue }),
  } satisfies OptionDefinition;
}

const { MockCommand, MockOption } = vi.hoisted(() => {
  class HoistedMockOption {
    private readonly definition: OptionDefinition;

    constructor(flags: string, _description: string) {
      this.definition = createOptionDefinition(flags);
    }

    choices(): this {
      return this;
    }

    default(value: unknown): this {
      this.definition.defaultValue = value;
      return this;
    }

    argParser(parser: OptionParser): this {
      this.definition.parser = parser;
      return this;
    }

    build(): OptionDefinition {
      return { ...this.definition };
    }
  }

  class HoistedMockCommand {
    private readonly definitions = new Map<string, OptionDefinition>();
    private readonly values: Record<string, unknown> = {};
    private readonly valueSources = new Map<string, string>();
    public parent?: HoistedMockCommand;

    option(flags: string, _description: string, defaultValue?: unknown): this {
      const definition = createOptionDefinition(flags, defaultValue);
      this.applyDefault(definition);
      this.definitions.set(definition.longFlag, definition);
      return this;
    }

    addOption(option: HoistedMockOption): this {
      const definition = option.build();
      this.applyDefault(definition);
      this.definitions.set(definition.longFlag, definition);
      return this;
    }

    parse(argv: readonly string[], _config: { from: 'user' }): this {
      let index = 0;
      while (index < argv.length) {
        const token = argv[index] ?? '';
        const definition = this.definitions.get(token);
        if (!definition) {
          index += 1;
          continue;
        }

        if (!definition.expectsValue) {
          this.values[definition.key] = true;
          this.valueSources.set(definition.key, 'cli');
          index += 1;
          continue;
        }

        const rawValue = argv[index + 1];
        if (rawValue === undefined) {
          index += 1;
          continue;
        }

        const parsedValue = definition.parser
          ? definition.parser(rawValue, this.values[definition.key])
          : rawValue;
        this.values[definition.key] = parsedValue;
        this.valueSources.set(definition.key, 'cli');
        index += 2;
      }

      return this;
    }

    opts(): Record<string, unknown> {
      return { ...this.values };
    }

    optsWithGlobals(): Record<string, unknown> {
      const parentValues = this.parent ? this.parent.optsWithGlobals() : {};
      return { ...parentValues, ...this.values };
    }

    getOptionValue(optionKey: string): unknown {
      return this.values[optionKey];
    }

    getOptionValueSource(optionKey: string): string | undefined {
      return this.valueSources.get(optionKey);
    }

    exitOverride(): this {
      return this;
    }

    private applyDefault(definition: OptionDefinition): void {
      if (definition.defaultValue !== undefined) {
        this.values[definition.key] = definition.defaultValue;
        this.valueSources.set(definition.key, 'default');
        return;
      }

      if (!definition.expectsValue) {
        this.values[definition.key] = false;
        this.valueSources.set(definition.key, 'default');
      }
    }
  }

  return { MockCommand: HoistedMockCommand, MockOption: HoistedMockOption };
});

vi.mock('commander', () => ({
  Command: MockCommand,
  Option: MockOption,
}));

const Command = MockCommand as unknown as { new (): CommanderCommand };

describe('audit CLI options', () => {
  it('normalises Commander options into a typed structure', () => {
    const command = new Command();
    command.exitOverride();
    registerAuditCliOptions(command);

    command.parse(
      [
        '--config',
        'dtifx.config.mjs',
        '--out-dir',
        'dist',
        '--json-logs',
        '--timings',
        '--reporter',
        'markdown',
        '--reporter',
        'json',
        '--telemetry',
        'stdout',
      ],
      { from: 'user' },
    );

    const options = resolveAuditCliOptions(command);

    expect(options).toEqual({
      config: 'dtifx.config.mjs',
      outDir: 'dist',
      jsonLogs: true,
      timings: true,
      reporter: ['markdown', 'json'],
      telemetry: 'stdout',
    });
  });

  it('resolves options inherited from the parent command', () => {
    const parent = new Command();
    parent.exitOverride();
    registerAuditCliOptions(parent);

    parent.parse(['--config', 'shared.config.ts', '--json-logs'], { from: 'user' });

    const child = new Command();
    child.exitOverride();
    (child as unknown as { parent: InstanceType<typeof Command> }).parent = parent;

    const options = resolveAuditCliOptions(child);

    expect(options).toEqual({
      config: 'shared.config.ts',
      outDir: 'dist',
      jsonLogs: true,
      timings: false,
      reporter: 'human',
      telemetry: 'none',
    });
  });

  it('prefers reporters defined on the child command', () => {
    const parent = new Command();
    parent.exitOverride();
    registerAuditCliOptions(parent);
    parent.parse(['--reporter', 'markdown'], { from: 'user' });

    const child = new Command();
    child.exitOverride();
    (child as unknown as { parent: InstanceType<typeof Command> }).parent = parent;
    registerAuditCliOptions(child);
    child.parse(['--reporter', 'json', '--reporter', 'html'], { from: 'user' });

    const options = resolveAuditCliOptions(child);

    expect(options.reporter).toEqual(['json', 'html']);
  });

  it('inherits reporters from the parent when the child does not override them', () => {
    const parent = new Command();
    parent.exitOverride();
    registerAuditCliOptions(parent);
    parent.parse(['--reporter', 'markdown', '--reporter', 'html'], { from: 'user' });

    const child = new Command();
    child.exitOverride();
    (child as unknown as { parent: InstanceType<typeof Command> }).parent = parent;
    registerAuditCliOptions(child);

    const options = resolveAuditCliOptions(child);

    expect(options.reporter).toEqual(['markdown', 'html']);
  });
});
