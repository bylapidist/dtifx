import type { BuildConfig, FormatterInstanceConfig } from '../config/index.js';
import { createAndroidMaterialColorsFormatterFactory } from '../infrastructure/formatting/android-material-colors-formatter.js';
import { createAndroidMaterialDimensionsFormatterFactory } from '../infrastructure/formatting/android-material-dimensions-formatter.js';
import { createAndroidMaterialGradientsFormatterFactory } from '../infrastructure/formatting/android-material-gradients-formatter.js';
import { createAndroidMaterialShadowsFormatterFactory } from '../infrastructure/formatting/android-material-shadows-formatter.js';
import { createAndroidMaterialTypographyFormatterFactory } from '../infrastructure/formatting/android-material-typography-formatter.js';
import { createAndroidComposeColorsFormatterFactory } from '../infrastructure/formatting/android-compose-colors-formatter.js';
import { createAndroidComposeTypographyFormatterFactory } from '../infrastructure/formatting/android-compose-typography-formatter.js';
import { createAndroidComposeShapesFormatterFactory } from '../infrastructure/formatting/android-compose-shapes-formatter.js';
import { createCssVariablesFormatterFactory } from '../infrastructure/formatting/css-variables-formatter.js';
import { createLessVariablesFormatterFactory } from '../infrastructure/formatting/less-variables-formatter.js';
import { createSassVariablesFormatterFactory } from '../infrastructure/formatting/sass-variables-formatter.js';
import { createJsonSnapshotFormatterFactory } from '../infrastructure/formatting/json-snapshot-formatter.js';
import { createJavascriptModuleFormatterFactory } from '../infrastructure/formatting/javascript-module-formatter.js';
import { createIosSwiftUiColorsFormatterFactory } from '../infrastructure/formatting/ios-swiftui-colors-formatter.js';
import { createIosSwiftUiDimensionsFormatterFactory } from '../infrastructure/formatting/ios-swiftui-dimensions-formatter.js';
import { createIosSwiftUiGradientsFormatterFactory } from '../infrastructure/formatting/ios-swiftui-gradients-formatter.js';
import { createIosSwiftUiShadowsFormatterFactory } from '../infrastructure/formatting/ios-swiftui-shadows-formatter.js';
import { createIosSwiftUiTypographyFormatterFactory } from '../infrastructure/formatting/ios-swiftui-typography-formatter.js';
import { createTypescriptModuleFormatterFactory } from '../infrastructure/formatting/typescript-module-formatter.js';
import type { FormatterDefinition } from './formatter-registry.js';

/**
 * Context passed to formatter definition factories containing the resolved build configuration and the
 * location of the configuration files when available.
 */
export interface FormatterDefinitionFactoryContext {
  readonly config: BuildConfig;
  readonly configDirectory?: string;
  readonly configPath?: string;
}

/**
 * Factory capable of converting formatter configuration entries into executable formatter definitions.
 */
export interface FormatterDefinitionFactory {
  readonly name: string;
  create(
    entry: FormatterInstanceConfig,
    context: FormatterDefinitionFactoryContext,
  ): FormatterDefinition;
}

/**
 * Registry responsible for storing {@link FormatterDefinitionFactory} instances by name.
 */
export class FormatterDefinitionFactoryRegistry {
  private readonly factories = new Map<string, FormatterDefinitionFactory>();

  constructor(initial: readonly FormatterDefinitionFactory[] = []) {
    for (const factory of initial) {
      this.register(factory);
    }
  }

  register(factory: FormatterDefinitionFactory): void {
    this.factories.set(factory.name, factory);
  }

  resolve(name: string): FormatterDefinitionFactory | undefined {
    return this.factories.get(name);
  }

  list(): readonly FormatterDefinitionFactory[] {
    return [...this.factories.values()];
  }
}

/**
 * Creates a formatter definition factory registry populated with the built-in formatter factories.
 * @returns {FormatterDefinitionFactoryRegistry} Registry seeded with built-in factories.
 */
export function createDefaultFormatterDefinitionRegistry(): FormatterDefinitionFactoryRegistry {
  return new FormatterDefinitionFactoryRegistry(createDefaultFormatterFactories());
}

/**
 * Creates the collection of CSS-oriented formatter definition factories provided by the build system.
 * @returns {readonly FormatterDefinitionFactory[]} The built-in CSS formatter factories.
 */
export function createCssFormatterFactories(): readonly FormatterDefinitionFactory[] {
  return [
    createCssVariablesFormatterFactory(),
    createSassVariablesFormatterFactory(),
    createLessVariablesFormatterFactory(),
  ];
}

/**
 * Creates the collection of SwiftUI-oriented formatter definition factories provided by the build system.
 * @returns {readonly FormatterDefinitionFactory[]} The built-in SwiftUI formatter factories.
 */
export function createIosSwiftUiFormatterFactories(): readonly FormatterDefinitionFactory[] {
  return [
    createIosSwiftUiColorsFormatterFactory(),
    createIosSwiftUiDimensionsFormatterFactory(),
    createIosSwiftUiGradientsFormatterFactory(),
    createIosSwiftUiShadowsFormatterFactory(),
    createIosSwiftUiTypographyFormatterFactory(),
  ];
}

/**
 * Creates the collection of Android-oriented formatter definition factories provided by the build system.
 * @returns {readonly FormatterDefinitionFactory[]} The built-in Android formatter factories.
 */
export function createAndroidMaterialFormatterFactories(): readonly FormatterDefinitionFactory[] {
  return [
    createAndroidMaterialColorsFormatterFactory(),
    createAndroidMaterialDimensionsFormatterFactory(),
    createAndroidMaterialTypographyFormatterFactory(),
    createAndroidMaterialGradientsFormatterFactory(),
    createAndroidMaterialShadowsFormatterFactory(),
  ];
}

/**
 * Creates the collection of Jetpack Compose oriented formatter definition factories provided by the build system.
 * @returns {readonly FormatterDefinitionFactory[]} The built-in Compose formatter factories.
 */
export function createAndroidComposeFormatterFactories(): readonly FormatterDefinitionFactory[] {
  return [
    createAndroidComposeColorsFormatterFactory(),
    createAndroidComposeTypographyFormatterFactory(),
    createAndroidComposeShapesFormatterFactory(),
  ];
}

/**
 * Generates the collection of default formatter definition factories supplied by the build system.
 * @returns {readonly FormatterDefinitionFactory[]} The built-in formatter factories.
 */
export function createDefaultFormatterFactories(): readonly FormatterDefinitionFactory[] {
  return [
    createJsonSnapshotFormatterFactory(),
    ...createModuleFormatterFactories(),
    ...createCssFormatterFactories(),
    ...createIosSwiftUiFormatterFactories(),
    ...createAndroidMaterialFormatterFactories(),
    ...createAndroidComposeFormatterFactories(),
  ];
}

/**
 * Creates the collection of module formatter definition factories provided by the build system.
 * @returns {readonly FormatterDefinitionFactory[]} The built-in module formatter factories.
 */
export function createModuleFormatterFactories(): readonly FormatterDefinitionFactory[] {
  return [createJavascriptModuleFormatterFactory(), createTypescriptModuleFormatterFactory()];
}

export { createCssVariablesFormatterFactory } from '../infrastructure/formatting/css-variables-formatter.js';
export { createLessVariablesFormatterFactory } from '../infrastructure/formatting/less-variables-formatter.js';
export { createSassVariablesFormatterFactory } from '../infrastructure/formatting/sass-variables-formatter.js';
export { createJsonSnapshotFormatterFactory } from '../infrastructure/formatting/json-snapshot-formatter.js';
export { createJavascriptModuleFormatterFactory } from '../infrastructure/formatting/javascript-module-formatter.js';
export { createIosSwiftUiColorsFormatterFactory } from '../infrastructure/formatting/ios-swiftui-colors-formatter.js';
export { createIosSwiftUiDimensionsFormatterFactory } from '../infrastructure/formatting/ios-swiftui-dimensions-formatter.js';
export { createIosSwiftUiGradientsFormatterFactory } from '../infrastructure/formatting/ios-swiftui-gradients-formatter.js';
export { createIosSwiftUiShadowsFormatterFactory } from '../infrastructure/formatting/ios-swiftui-shadows-formatter.js';
export { createIosSwiftUiTypographyFormatterFactory } from '../infrastructure/formatting/ios-swiftui-typography-formatter.js';
export { createAndroidMaterialColorsFormatterFactory } from '../infrastructure/formatting/android-material-colors-formatter.js';
export { createAndroidMaterialDimensionsFormatterFactory } from '../infrastructure/formatting/android-material-dimensions-formatter.js';
export { createAndroidMaterialTypographyFormatterFactory } from '../infrastructure/formatting/android-material-typography-formatter.js';
export { createAndroidMaterialGradientsFormatterFactory } from '../infrastructure/formatting/android-material-gradients-formatter.js';
export { createAndroidMaterialShadowsFormatterFactory } from '../infrastructure/formatting/android-material-shadows-formatter.js';
export { createAndroidComposeColorsFormatterFactory } from '../infrastructure/formatting/android-compose-colors-formatter.js';
export { createAndroidComposeTypographyFormatterFactory } from '../infrastructure/formatting/android-compose-typography-formatter.js';
export { createAndroidComposeShapesFormatterFactory } from '../infrastructure/formatting/android-compose-shapes-formatter.js';
export { createTypescriptModuleFormatterFactory } from '../infrastructure/formatting/typescript-module-formatter.js';
