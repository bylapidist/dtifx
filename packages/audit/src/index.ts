export { describe, manifest } from './manifest.js';
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
} from './domain/policies/policy-engine.js';
export type { PolicySeverity } from '@dtifx/core';
export {
  createDeprecationReplacementPolicy,
  createRequireOwnerPolicy,
  createRequireOverrideApprovalPolicy,
  createRequireTagPolicy,
  createWcagContrastPolicy,
} from './domain/policies/default-policies.js';
export {
  extractTokenTags,
  matchesTokenSelector,
  type PointerPattern,
  type TokenSelector,
} from './domain/selectors/token-selector.js';
export {
  type PolicyTokenDefinition,
  type PolicyTokenMetadata,
  type PolicyTokenProvenance,
  type PolicyTokenResolution,
  type PolicyTokenSnapshot,
  type TokenSnapshot,
} from './domain/tokens/token-snapshot.js';
export { isTokenTypeIdentifier, type TokenTypeIdentifier } from './domain/tokens/token-types.js';
export {
  parseColorValue,
  toColorCssOutput,
  type ColorCssMetadata,
  type ColorValue,
  type RgbComponentArray,
} from './domain/colors/color-utils.js';
export type {
  AuditConfig,
  PolicyConfigEntry,
  PolicyPluginConfigEntry,
  PolicyPluginModuleConfig,
} from './config/index.js';
export {
  loadAuditConfiguration,
  resolveAuditConfigPath,
} from './application/configuration/config-loader.js';
export type {
  LoadAuditConfigurationOptions,
  LoadedAuditConfiguration,
  ResolveAuditConfigPathOptions,
} from './application/configuration/config-loader.js';
export {
  createDefaultPolicyRuleRegistry,
  createPolicyConfiguration,
  createPolicyRules,
  loadPolicyRuleRegistry,
  PolicyRuleFactoryRegistry,
} from './application/configuration/policies.js';
export type {
  AuditConfigurationSource,
  LoadPolicyRuleRegistryOptions,
  PolicyConfigurationOverrides,
  PolicyConfigurationResult,
  PolicyRuleFactory,
  PolicyRuleFactoryContext,
  PolicyPlugin,
  PolicyPluginContext,
  PolicyPluginImporter,
  PolicyPluginModule,
} from './application/configuration/policies.js';
export {
  createAuditReporter,
  type AuditReporter,
  type AuditReporterFormat,
  type AuditReporterOptions,
  type AuditRunMetadata,
  type AuditRunResult,
  type AuditSummary,
  type AuditTimings,
} from './application/reporting/cli-reporters.js';
export {
  policyEngine,
  type PolicyEngineRunOptions,
  type PolicyEngineRunResult,
} from './application/policy-engine/policy-engine.js';
export {
  createAuditRuntime,
  type AuditPipelineTimings,
  type AuditRuntime,
  type AuditRuntimeClock,
  type AuditTelemetryAttributeScalar,
  type AuditTelemetryAttributeValue,
  type AuditTelemetryAttributes,
  type AuditTelemetryRuntime,
  type AuditTelemetrySpan,
  type AuditTelemetrySpanEndOptions,
  type AuditTelemetrySpanOptions,
  type AuditTelemetrySpanStatus,
  type AuditTokenMetrics,
  type AuditTokenResolutionContext,
  type AuditTokenResolutionPort,
  type AuditTokenResolutionResult,
  type CreateAuditRuntimeOptions,
} from './application/runtime/audit-runtime.js';
export {
  createAuditTokenResolutionEnvironment,
  type AuditTokenResolutionEnvironment,
  type CreateAuditTokenResolutionEnvironmentDependencies,
  type CreateAuditTokenResolutionEnvironmentOptions,
} from './application/runtime/audit-token-resolution-environment.js';
export {
  createBuildTokenResolutionEnvironment,
  type BuildModuleIntegration,
  type BuildTokenResolutionEnvironment,
  type CreateBuildTokenResolutionOptions,
} from './application/runtime/build-token-resolution.js';
