import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  createPolicyConfiguration,
  createPolicyRules,
  loadPolicyRuleRegistry,
  PolicyRuleFactoryRegistry,
  type PolicyConfigurationOverrides,
  type PolicyConfigEntry,
} from './configuration.js';
import {
  PolicyEngine,
  createPolicyRulesFromDefinitions,
  type PolicyDefinition,
} from '../engine/index.js';
import * as defaultPolicies from '../definitions/default-policies.js';

interface ExampleConfig {
  readonly audit?: {
    readonly policies?: readonly PolicyConfigEntry[];
    readonly plugins?: readonly unknown[];
  };
}

const baseConfigDirectory = '/workspace/config';
const baseConfigPath = '/workspace/config/dtifx.config.mjs';

describe('createPolicyConfiguration', () => {
  it('returns empty rule sets when no audit configuration is present', () => {
    const result = createPolicyConfiguration({});

    expect(result.rules).toHaveLength(0);
  });

  it('constructs rules using the default definition registry', () => {
    const config = {
      audit: {
        policies: [
          {
            name: 'governance.requireOwner',
            options: { field: 'owner', extension: 'org.example.governance', severity: 'warning' },
          },
        ],
      },
    } satisfies ExampleConfig;

    const result = createPolicyConfiguration(config);

    expect(result.rules).toHaveLength(1);
    expect(typeof result.engine.run).toBe('function');
  });

  it('honours provided overrides for rules and engine', () => {
    const definition = {
      name: 'custom.policy',
      run: vi.fn(),
    } satisfies PolicyDefinition;
    const rules = createPolicyRulesFromDefinitions([definition]);
    const overrides = {
      rules,
      engine: new PolicyEngine({ rules }),
    } satisfies PolicyConfigurationOverrides;

    const result = createPolicyConfiguration({ audit: { policies: [] } }, overrides);

    expect(result.rules).toBe(overrides.rules);
    expect(result.engine).toBe(overrides.engine);
  });

  it('resolves relative WCAG pointers while preserving fragments', () => {
    const spy = vi.spyOn(defaultPolicies, 'createWcagContrastPolicy');
    const config = {
      audit: {
        policies: [
          {
            name: 'governance.wcagContrast',
            options: {
              pairs: [
                {
                  label: 'Example pair',
                  foreground: './tokens.json#/palette/background',
                  background: './tokens.json#/palette/foreground',
                },
              ],
            },
          },
        ],
      },
    } satisfies ExampleConfig;

    createPolicyConfiguration(config, {
      ruleFactoryContext: { configDirectory: baseConfigDirectory, configPath: baseConfigPath },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const options = spy.mock.calls[0]?.[0];
    const expectedBase = pathToFileURL(path.join(baseConfigDirectory, 'tokens.json')).href;
    expect(options?.pairs).toEqual([
      expect.objectContaining({
        label: 'Example pair',
        foreground: `${expectedBase}#/palette/background`,
        background: `${expectedBase}#/palette/foreground`,
      }),
    ]);
    spy.mockRestore();
  });

  it('throws when governance.requireTag is missing tag options', () => {
    const config = {
      audit: {
        policies: [
          {
            name: 'governance.requireTag',
            options: { severity: 'warning' },
          },
        ],
      },
    } satisfies ExampleConfig;

    expect(() => createPolicyConfiguration(config)).toThrow(
      'Failed to parse options for policy "governance.requireTag": Policy "governance.requireTag" requires a "tag" or "tags" option to be provided.',
    );
  });

  it('throws when governance.requireOverrideApproval minimumApprovals is not an integer', () => {
    const config = {
      audit: {
        policies: [
          {
            name: 'governance.requireOverrideApproval',
            options: { layer: 'base', minimumApprovals: 1.5 },
          },
        ],
      },
    } satisfies ExampleConfig;

    expect(() => createPolicyConfiguration(config)).toThrow(
      'Failed to parse options for policy "governance.requireOverrideApproval": minimumApprovals: Policy "governance.requireOverrideApproval" option "minimumApprovals" must be a positive integer.',
    );
  });

  it('throws when governance.wcagContrast pairs are empty', () => {
    const config = {
      audit: {
        policies: [
          {
            name: 'governance.wcagContrast',
            options: { pairs: [] },
          },
        ],
      },
    } satisfies ExampleConfig;

    expect(() => createPolicyConfiguration(config)).toThrow(
      'Failed to parse options for policy "governance.wcagContrast": pairs: Policy "governance.wcagContrast" pairs option must include at least one foreground/background pair.',
    );
  });
});

describe('createPolicyRules', () => {
  it('throws when duplicate policy names are provided', () => {
    const definition = { name: 'example.policy', run: vi.fn() } satisfies PolicyDefinition;
    const registry = new PolicyRuleFactoryRegistry([
      {
        name: 'example.policy',
        create: () => createPolicyRulesFromDefinitions([definition]),
      },
    ]);

    expect(() =>
      createPolicyRules([{ name: 'example.policy' }, { name: 'example.policy' }], registry),
    ).toThrow('Duplicate policy configuration for "example.policy".');
  });

  it('throws when a policy entry is not registered in the factory registry', () => {
    const registry = new PolicyRuleFactoryRegistry();

    expect(() => createPolicyRules([{ name: 'missing.policy' }], registry)).toThrow(
      'Unknown policy "missing.policy" in configuration.',
    );
  });
});

describe('loadPolicyRuleRegistry', () => {
  it('imports plugin modules and registers factories', async () => {
    const definition = { name: 'plugin.policy', run: vi.fn() } satisfies PolicyDefinition;
    const config = {
      audit: {
        plugins: [
          {
            module: './policies/plugin.js',
            options: { severity: 'warning' },
          },
        ],
      },
    } satisfies ExampleConfig;

    const register = vi.fn(
      ({
        registry: contextRegistry,
        options,
        config: providedConfig,
        configDirectory,
        configPath,
      }) => {
        expect(providedConfig).toBe(config);
        expect(configDirectory).toBe('/workspace/config');
        expect(configPath).toBe('/workspace/config/dtifx.config.mjs');
        expect(options).toEqual({ severity: 'warning' });

        contextRegistry.register({
          name: 'plugin.policy',
          create: () => definition,
        });
      },
    );

    const importer = vi.fn(async () => ({ registerPolicies: register }));

    const registry = await loadPolicyRuleRegistry({
      config,
      configDirectory: '/workspace/config',
      configPath: '/workspace/config/dtifx.config.mjs',
      importModule: importer,
    });

    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer.mock.calls[0]?.[0]).toBe('file:///workspace/config/policies/plugin.js');
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        config,
        configDirectory: '/workspace/config',
        configPath: '/workspace/config/dtifx.config.mjs',
        options: { severity: 'warning' },
      }),
    );

    const factory = registry.resolve('plugin.policy');
    expect(factory).toBeDefined();

    const created = factory?.create({ name: 'plugin.policy' }, { config });
    expect(created).toBe(definition);
  });

  it('allows bare package names for policy plugins', async () => {
    const config = {
      audit: { plugins: ['policy-plugin-package'] },
    } satisfies ExampleConfig;
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ default: plugin }));

    await loadPolicyRuleRegistry({
      config,
      configDirectory: baseConfigDirectory,
      configPath: baseConfigPath,
      importModule: importer,
    });

    expect(importer).toHaveBeenCalledWith('policy-plugin-package');
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('allows file URLs for policy plugins', async () => {
    const specifier = pathToFileURL(path.join(baseConfigDirectory, 'policies', 'plugin.mjs')).href;
    const config = {
      audit: { plugins: [specifier] },
    } satisfies ExampleConfig;
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ registerPolicies: plugin }));

    await loadPolicyRuleRegistry({
      config,
      configDirectory: baseConfigDirectory,
      configPath: baseConfigPath,
      importModule: importer,
    });

    expect(importer).toHaveBeenCalledWith(specifier);
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('rejects policy plugin specifiers that use unsupported protocols', async () => {
    const config = {
      audit: { plugins: ['node:policy-plugin'] },
    } satisfies ExampleConfig;
    const importer = vi.fn();

    await expect(
      loadPolicyRuleRegistry({
        config,
        configDirectory: baseConfigDirectory,
        configPath: baseConfigPath,
        importModule: importer,
      }),
    ).rejects.toThrow(
      'Policy plugin module specifiers must be bare package names or filesystem paths. ' +
        'Received "node:policy-plugin".',
    );

    expect(importer).not.toHaveBeenCalled();
  });

  it('rejects empty plugin specifiers', async () => {
    const config = {
      audit: { plugins: ['   '] },
    } satisfies ExampleConfig;
    const importer = vi.fn();

    await expect(
      loadPolicyRuleRegistry({
        config,
        configDirectory: baseConfigDirectory,
        configPath: baseConfigPath,
        importModule: importer,
      }),
    ).rejects.toThrow(
      'Failed to parse policy plugin configuration: Policy plugin specifiers must be non-empty strings.',
    );

    expect(importer).not.toHaveBeenCalled();
  });
});
