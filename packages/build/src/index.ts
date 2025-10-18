export type { LoadedConfig } from './application/configuration/config-loader.js';
export type {
  AuditConfig,
  BuildConfig,
  DependencyConfig,
  DependencyStrategyConfig,
  DependencyStrategyPluginConfigEntry,
  FileGlobSourceConfig,
  FormatterInstanceConfig,
  FormatterOutputConfig,
  LayerConfig,
  PointerPlaceholder,
  PointerPlaceholderName,
  PointerTemplate,
  PointerTemplateSegment,
  PolicyConfigEntry,
  PolicyPluginConfigEntry,
  PolicyPluginModuleConfig,
  SourceConfig,
  TransformConfig,
  TransformConfigEntry,
  TransformPluginConfigEntry,
  TransformPluginModuleConfig,
  VirtualSourceConfig,
} from './config/index.js';

export { loadConfig, resolveConfigPath } from './application/configuration/config-loader.js';
export { defineConfig, placeholder, pointerTemplate } from './config/index.js';
export type {
  BuildEvent,
  BuildStageCompletedEvent,
  BuildStageErroredEvent,
  BuildStageStartedEvent,
  DomainEvent,
} from './domain/events/build-events.js';
export type {
  BuildResolvedPlan,
  BuildResolvedSource,
  BuildTokenSnapshot,
  ResolutionCacheStatus,
} from './domain/models/tokens.js';
export type {
  DomainEventBusPort,
  DomainEventSubscriber,
  DomainEventSubscription,
} from './domain/ports/event-bus.js';
export {
  InMemoryDomainEventBus,
  attachLifecycleObservers,
  createLifecycleObserverEventBus,
  resolveLifecycleEventBus,
} from './domain/events/index.js';
export type {
  SchemaValidationIssue,
  SchemaValidationPort,
  SourceDiscoveryContext,
  SourceDiscoveryOutcome,
  SourceDocument,
  SourceIssue,
  SourceRepositoryIssue,
  SourceRepositoryPort,
} from './domain/ports/source.js';
export type {
  BuildErrorEvent,
  BuildLifecycleObserverPort,
  BuildStage,
  BuildStageEvent,
} from './domain/ports/telemetry.js';
export {
  SourcePlanningService,
  UnknownLayerError,
} from './domain/services/source-planning-service.js';
export type {
  SourcePlanningResult,
  SourcePlanningServiceOptions,
} from './domain/services/source-planning-service.js';
export { TokenResolutionService } from './domain/services/token-resolution-service.js';
export type { TokenResolutionServiceOptions } from './domain/services/token-resolution-service.js';
export { TransformationService } from './domain/services/transformation-service.js';
export type {
  TransformationRunResult,
  TransformationServiceOptions,
} from './domain/services/transformation-service.js';
export { FormattingService } from './domain/services/formatting-service.js';
export type { FormattingServiceOptions } from './domain/services/formatting-service.js';
export type {
  ArtifactWriterPort,
  FormatterExecution,
  FormatterExecutorPort,
  FormatterExecutorRequest,
  FormatterExecutorResponse,
  FormatterPlan,
  FormatterPlannerPort,
  FormattingPort,
  FormattingRequest,
  FormattingResponse,
} from './domain/ports/formatters.js';
export type {
  DependencyDiffStrategyPort,
  DependencySnapshotBuilderPort,
  DependencyStorePort,
} from './domain/ports/dependencies.js';
export type { ScheduledTask, TaskCompletion, TaskSchedulerPort } from './domain/ports/scheduler.js';
export type {
  WatchCallbacks,
  WatchError,
  WatchEvent,
  WatchEventType,
  WatchOptions,
  WatchRequest,
  WatchSubscription,
  WatcherPort,
} from './domain/ports/watchers.js';
export { JsonLineLogger, createBuildStageLoggingSubscriber, noopLogger } from './logging/index.js';
export type { LogLevel, StructuredLogEvent, StructuredLogger } from './logging/index.js';
export {
  createBuildStageTelemetryEventSubscriber,
  createTelemetryTracer,
  noopTelemetryTracer,
} from './telemetry/index.js';
export type {
  TelemetryAttributeValue,
  TelemetryAttributes,
  TelemetrySpan,
  TelemetrySpanEndOptions,
  TelemetrySpanOptions,
  TelemetrySpanStatus,
  TelemetryTracer,
  TelemetryTracerOptions,
} from './telemetry/index.js';
export { createTelemetryRuntime } from '@dtifx/core/telemetry';
export type { TelemetryMode, TelemetryRuntime } from '@dtifx/core/telemetry';
export type {
  LoadedBuildConfiguration,
  RuntimeEnvironment,
  RuntimeEnvironmentFactory,
  RuntimeEnvironmentFactoryRequest,
} from './application/environments/runtime-environment.js';
export { createDefaultBuildEnvironment } from './application/environments/default-build-environment.js';
export { SourcePlanner, SourcePlannerError } from './application/planner/source-planner.js';
export type { PlannerOptions, SourcePlannerFailure } from './application/planner/source-planner.js';
export {
  ResolutionSession,
  type ResolutionMetrics,
  type ResolutionSessionOptions,
  type ResolvedPlan,
  type ResolvedSourceEntry,
  type TokenSnapshot,
} from './session/resolution-session.js';
export { FileSystemTokenCache } from './session/file-system-token-cache.js';
export {
  DefaultSourceRepository,
  type DefaultSourceRepositoryOptions,
} from './infrastructure/sources/default-source-repository.js';
export {
  PointerTemplateError,
  resolvePointerTemplate,
  type PointerTemplateContext,
} from './infrastructure/sources/pointer-template.js';
export { DtifSchemaValidationAdapter } from './infrastructure/validation/dtif-schema-validator.js';
export {
  DefaultParserAdapter,
  type DefaultParserAdapterOptions,
} from './infrastructure/resolution/default-parser.js';
export { SequentialTaskScheduler } from './infrastructure/scheduler/sequential-task-scheduler.js';
export {
  DefaultTransformExecutor,
  type DefaultTransformExecutorOptions,
} from './infrastructure/transforms/default-transform-executor.js';
export { ChokidarWatcher } from './infrastructure/watch/chokidar-watcher.js';
export {
  FileSystemTransformCache,
  type FileSystemTransformCacheOptions,
  InMemoryTransformCache,
  type TransformCache,
  type TransformCacheEntry,
  type TransformCacheKey,
  type TransformCacheStatus,
} from './transform/transform-cache.js';
export {
  DependencyTrackingService,
  type DependencyTrackingResult,
  type DependencyTrackingServiceOptions,
} from './domain/services/dependency-tracking-service.js';
export {
  SnapshotDependencyDiffStrategy,
  SnapshotDependencySnapshotBuilder,
  GraphDependencyDiffStrategy,
} from './domain/services/dependency-strategy-defaults.js';
export {
  FileSystemTokenDependencyCache,
  createTokenDependencySnapshot,
  type TokenDependencyCache,
  type TokenDependencyDiff,
  type TokenDependencyEntry,
  type TokenDependencySnapshot,
} from './incremental/token-dependency-cache.js';
export {
  DefaultDependencyStrategyRegistry,
  DependencyStrategyRegistry,
  createGraphDependencyStrategyDefinition,
  createSnapshotDependencyStrategyDefinition,
  type DependencyStrategyDefinition,
  type DependencyStrategyInstance,
  type DependencyStrategyCreateContext,
} from './incremental/dependency-strategy-registry.js';
export {
  createBuildRuntime,
  executeBuild,
  type BuildRuntimeOptions,
  type BuildRuntimeServices,
  type BuildRunOptions,
  type BuildRunResult,
  type BuildTimings,
  type FormatterExecutionResult,
  type TransformCacheSummary,
} from './application/build-runtime.js';
export {
  runTaskQueue,
  normaliseConcurrency,
  type TaskDefinition,
  type TaskQueueMetrics,
  type TaskQueueOptions,
  type TaskQueueOutcome,
  type TaskResult,
} from './concurrency/task-queue.js';
export {
  createTransformConfiguration,
  createDefaultTransformDefinitionRegistry,
  createCssTransformFactories,
  createAndroidMaterialTransformFactories,
  createAndroidComposeTransformFactories,
  createIosSwiftUiTransformFactories,
  loadTransformDefinitionRegistry,
  type TransformConfigurationOverrides,
  type TransformConfigurationResult,
  type TransformDefinitionFactory,
  type TransformDefinitionFactoryContext,
  TransformDefinitionFactoryRegistry,
} from './application/configuration/transforms.js';
export {
  createDependencyConfiguration,
  loadDependencyStrategyRegistry,
  type DependencyConfigurationOverrides,
  type DependencyConfigurationResult,
  type DependencyStrategyPlugin,
  type DependencyStrategyPluginContext,
  type DependencyStrategyPluginImporter,
  type DependencyStrategyPluginModule,
  type LoadDependencyStrategyRegistryOptions,
} from './application/configuration/dependencies.js';
export {
  createPolicyConfiguration,
  createDefaultPolicyRuleRegistry,
  createPolicyRules,
  loadPolicyRuleRegistry,
  PolicyRuleFactoryRegistry,
  type PolicyConfigurationOverrides,
  type PolicyConfigurationResult,
  type PolicyRuleFactory,
  type PolicyRuleFactoryContext,
  type LoadPolicyRuleRegistryOptions,
  type PolicyPlugin,
  type PolicyPluginContext,
  type PolicyPluginImporter,
  type PolicyPluginModule,
} from './application/configuration/policies.js';
export {
  startWatchPipeline,
  type WatchBuildReportContext,
  type WatchPipelineHandle,
  type WatchPipelineOptions,
  type WatchPipelineReporter,
} from './application/pipelines/watch-pipeline.js';
export {
  TransformEngine,
  TransformRegistry,
  createTransformOptionsHash,
  defineTransform,
  STATIC_TRANSFORM_OPTIONS_HASH,
  type PointerPattern,
  type TransformDefinition,
  type TransformEngineOptions,
  type TransformHandler,
  type TransformInput,
  type TransformInputForSelector,
  type TransformResult,
  type TransformRunOptions,
  type TransformSelector,
  type TypedTransformDefinition,
  type TypedTransformHandler,
} from './transform/transform-registry.js';
export { createDefaultTransforms } from './transform/default-transforms.js';
export { createCssTransforms } from './transform/css-transforms.js';
export { createAndroidMaterialTransforms } from './transform/android-material-transforms.js';
export { createAndroidComposeTransforms } from './transform/android-compose-transforms.js';
export { createIosSwiftUiTransforms } from './transform/ios-swiftui-transforms.js';
export {
  createColorTransforms,
  createAndroidMaterialColorTransforms,
  createAndroidComposeColorTransforms,
  createIosSwiftUiColorTransforms,
  colorToCssTransform,
  colorToAndroidArgbTransform,
  colorToAndroidComposeColorTransform,
  colorTokenVariantsTransform,
  colorToSwiftUIColorTransform,
  type ColorCssTransformOutput,
  type ColorAndroidArgbTransformOutput,
  type ColorAndroidComposeTransformOutput,
  type ColorSwiftUIColorTransformOutput,
  type ColorTokenVariantsTransformOutput,
} from './transform/color-transforms.js';
export {
  createDimensionTransforms,
  createAndroidMaterialDimensionTransforms,
  createIosSwiftUiDimensionTransforms,
  dimensionToPxTransform,
  dimensionToRemTransform,
  dimensionToAndroidDpTransform,
  dimensionToAndroidSpTransform,
  dimensionToSwiftUiPointsTransform,
  evaluateDimensionToken,
  type DimensionPxTransformOutput,
  type DimensionRemTransformOutput,
  type DimensionAndroidDpTransformOutput,
  type DimensionAndroidSpTransformOutput,
  type DimensionSwiftUiTransformOutput,
  type EvaluatedDimensionToken,
} from './transform/dimension-transforms.js';
export {
  createGradientTransforms,
  createAndroidMaterialGradientTransforms,
  createIosSwiftUiGradientTransforms,
  gradientToCssTransform,
  gradientToAndroidMaterialTransform,
  gradientToSwiftUiTransform,
  type GradientCssTransformOutput,
  type GradientAndroidMaterialStopOutput,
  type GradientAndroidMaterialTransformOutput,
  type GradientSwiftUiStopOutput,
  type GradientSwiftUiTransformOutput,
} from './transform/gradient-transforms.js';
export {
  createCssBorderTransforms,
  createAndroidComposeBorderTransforms,
  borderToCssTransform,
  borderToAndroidComposeShapeTransform,
  type BorderCssTransformOutput,
  type BorderAndroidComposeShapeTransformOutput,
} from './transform/border-transforms.js';
export {
  createAndroidMaterialShadowTransforms,
  createIosSwiftUiShadowTransforms,
  createCssShadowTransforms,
  shadowToAndroidMaterialTransform,
  shadowToCssTransform,
  shadowToSwiftUiTransform,
  type ShadowAndroidMaterialLayerOutput,
  type ShadowAndroidMaterialTransformOutput,
  type ShadowCssTransformOutput,
  type ShadowSwiftUiLayerOutput,
  type ShadowSwiftUiTransformOutput,
} from './transform/shadow-transforms.js';
export {
  createTypographyTransforms,
  createAndroidMaterialTypographyTransforms,
  createAndroidComposeTypographyTransforms,
  createIosSwiftUiTypographyTransforms,
  typographyToCssTransform,
  typographyToAndroidMaterialTransform,
  typographyToAndroidComposeTransform,
  typographyToSwiftUiTransform,
  type TypographyCssTransformOutput,
  type TypographyAndroidMaterialLineHeightOutput,
  type TypographyAndroidMaterialTransformOutput,
  type TypographyAndroidComposeTransformOutput,
  type TypographySwiftUiLineHeightOutput,
  type TypographySwiftUiTransformOutput,
} from './transform/typography-transforms.js';
export {
  FormatterEngine,
  FormatterRegistry,
  createFormatterExecutionContext,
  runFormatterDefinition,
  type ArtifactEncoding,
  type FileArtifact,
  type FormatterDefinition,
  type FormatterEngineOptions,
  type FormatterExecutionContext,
  type FormatterHandler,
  type FormatterHandlerInput,
  type FormatterSelector,
  type FormatterToken,
} from './formatter/formatter-registry.js';
export {
  createDefaultFormatterDefinitionRegistry,
  createDefaultFormatterFactories,
  createCssFormatterFactories,
  createIosSwiftUiFormatterFactories,
  createAndroidMaterialFormatterFactories,
  createAndroidComposeFormatterFactories,
  createAndroidMaterialColorsFormatterFactory,
  createAndroidMaterialDimensionsFormatterFactory,
  createAndroidMaterialGradientsFormatterFactory,
  createAndroidMaterialShadowsFormatterFactory,
  createAndroidMaterialTypographyFormatterFactory,
  createAndroidComposeColorsFormatterFactory,
  createAndroidComposeTypographyFormatterFactory,
  createAndroidComposeShapesFormatterFactory,
  createCssVariablesFormatterFactory,
  createLessVariablesFormatterFactory,
  createJsonSnapshotFormatterFactory,
  createIosSwiftUiColorsFormatterFactory,
  createIosSwiftUiDimensionsFormatterFactory,
  createIosSwiftUiGradientsFormatterFactory,
  createIosSwiftUiShadowsFormatterFactory,
  createIosSwiftUiTypographyFormatterFactory,
  createSassVariablesFormatterFactory,
  FormatterDefinitionFactoryRegistry,
  type FormatterDefinitionFactory,
  type FormatterDefinitionFactoryContext,
} from './formatter/formatter-factory.js';
export {
  DefaultFormatterRegistry,
  type DefaultFormatterRegistryOptions,
} from './infrastructure/formatting/default-formatter-registry.js';
export { DefaultFormatterExecutor } from './infrastructure/formatting/default-formatter-executor.js';
export {
  FileSystemArtifactWriter,
  type FileSystemArtifactWriterOptions,
} from './infrastructure/formatting/file-system-artifact-writer.js';
export {
  createFormatterConfiguration,
  getFormatterConfigEntries,
  loadFormatterDefinitionRegistry,
  type FormatterConfigurationOverrides,
  type FormatterConfigurationResult,
  type FormatterPlugin,
  type FormatterPluginContext,
  type FormatterPluginImporter,
  type FormatterPluginModule,
  type LoadFormatterDefinitionRegistryOptions,
} from './application/configuration/formatters.js';
export {
  createFormatterPreset,
  createJavascriptModuleFormatterPreset,
  createTypescriptModuleFormatterPreset,
  createCssFormatterPreset,
  createJsonFormatterPreset,
  createIosSwiftUiFormatterPreset,
  createAndroidMaterialFormatterPreset,
  createAndroidComposeFormatterPreset,
  type FormatterPresetOptions,
  type JavascriptModuleFormatterPresetOptions,
  type TypescriptModuleFormatterPresetOptions,
  type CssFormatterPresetOptions,
  type JsonFormatterPresetOptions,
  type IosSwiftUiFormatterPresetOptions,
  type AndroidMaterialFormatterPresetOptions,
  type AndroidComposeFormatterPresetOptions,
  type FormatterPresetEntryOverrides,
} from './config/formatter-presets.js';
export {
  createTransformPreset,
  createCssTransformPreset,
  createIosSwiftUiTransformPreset,
  createAndroidMaterialTransformPreset,
  createAndroidComposeTransformPreset,
  type TransformPresetOptions,
  type CssTransformPresetOptions,
  type IosSwiftUiTransformPresetOptions,
  type AndroidMaterialTransformPresetOptions,
  type AndroidComposeTransformPresetOptions,
  type TransformPresetEntryOverrides,
} from './config/transform-presets.js';
export {
  createBuildPreset,
  createCssBuildPreset,
  createIosSwiftUiBuildPreset,
  createAndroidMaterialBuildPreset,
  createAndroidComposeBuildPreset,
  type BuildPresetOptions,
  type CssBuildPresetOptions,
  type IosSwiftUiBuildPresetOptions,
  type AndroidMaterialBuildPresetOptions,
  type AndroidComposeBuildPresetOptions,
} from './config/build-presets.js';
export {
  TRANSFORM_GROUP_ANDROID_MATERIAL,
  TRANSFORM_GROUP_ANDROID_COMPOSE,
  TRANSFORM_GROUP_ANALYTICS_RAW,
  TRANSFORM_GROUP_DEFAULT,
  TRANSFORM_GROUP_IOS_SWIFTUI,
  TRANSFORM_GROUP_LEGACY_CORE,
  TRANSFORM_GROUP_WEB_BASE,
  compareTransformGroups,
  normaliseTransformGroupName,
} from './transform/transform-groups.js';
export type {
  BorderValue,
  ColorToken,
  ColorValue,
  ComponentValue,
  CursorValue,
  DimensionToken,
  DimensionValue,
  DimensionKind,
  DurationValue,
  EasingValue,
  ElevationValue,
  FilterOperation,
  FilterValue,
  GradientStopValue,
  GradientValue,
  LineHeightValue,
  MotionParameters,
  MotionValue,
  OpacityValue,
  RgbComponentArray,
  ShadowLayerEntry,
  ShadowTokenValue,
  StrokeStyleValue,
  TokenTypeIdentifier,
  TokenTypeValue,
  TokenTypeValueMap,
  TypographyValue,
  ValueWrapper,
  ZIndexValue,
} from './types/token-value-types.js';
export { isTokenTypeIdentifier } from './types/token-value-types.js';
