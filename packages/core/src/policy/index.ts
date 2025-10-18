export {
  createDefaultPolicyRuleRegistry,
  createPolicyConfiguration,
  createPolicyRules,
  loadPolicyRuleRegistry,
  PolicyRuleFactoryRegistry,
  type AuditConfig,
  type AuditConfigurationSource,
  type LoadPolicyRuleRegistryOptions,
  type PolicyConfigurationOverrides,
  type PolicyConfigurationResult,
  type PolicyConfigEntry,
  type PolicyConfigurationSource,
  type PolicyRuleFactory,
  type PolicyRuleFactoryContext,
  type PolicyPlugin,
  type PolicyPluginConfigEntry,
  type PolicyPluginContext,
  type PolicyPluginImporter,
  type PolicyPluginModule,
  type PolicyPluginModuleConfig,
} from './configuration/index.js';

export {
  createDeprecationReplacementPolicy,
  createRequireOwnerPolicy,
  createRequireOverrideApprovalPolicy,
  createRequireTagPolicy,
  createWcagContrastPolicy,
} from './definitions/default-policies.js';

export {
  computeRelativeLuminance,
  normaliseColorValueToSrgb,
  parseColorValue,
  toColorCssOutput,
  type ColorCssMetadata,
  type ColorValue,
  type RgbComponentArray,
} from './colors/index.js';

export {
  extractTokenTags,
  matchesTokenSelector,
  type PointerPattern,
  type TokenSelector,
  type TokenSelectorSnapshot,
} from './selectors/index.js';

export {
  PolicyEngine,
  createPolicyRule,
  createPolicyRulesFromDefinitions,
  summarisePolicyResults,
  type PolicyContext,
  type PolicyDefinition,
  type PolicyEngineOptions,
  type PolicyEvaluation,
  type PolicyExecutionResult,
  type PolicyHandler,
  type PolicyInput,
  type PolicyRule,
  type PolicyRuleDescriptor,
  type PolicyRuleSetup,
  type PolicyRuleSetupOptions,
  type PolicySummary,
  type PolicyViolation,
} from './engine/index.js';

export type {
  PolicyTokenDefinition,
  PolicyTokenMetadata,
  PolicyTokenProvenance,
  PolicyTokenResolution,
  PolicyTokenSnapshot,
  TokenSnapshot,
} from './tokens/index.js';

export {
  createPolicyViolationSummary,
  POLICY_SEVERITIES,
  summarisePolicyViolations,
  type PolicySeverity,
  type PolicyViolationLike,
  type PolicyViolationSummary,
} from './summary.js';
