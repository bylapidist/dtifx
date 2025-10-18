import { describe, expect, it } from 'vitest';

import {
  createAndroidComposeFormatterFactories,
  createAndroidMaterialFormatterFactories,
  createCssFormatterFactories,
  createDefaultFormatterFactories,
  createIosSwiftUiFormatterFactories,
} from './formatter-factory.js';

describe('createDefaultFormatterFactories', () => {
  it('includes the built-in formatter factories', () => {
    const factories = createDefaultFormatterFactories();

    expect(factories.map((factory) => factory.name)).toStrictEqual([
      'json.snapshot',
      'javascript.module',
      'typescript.module',
      'css.variables',
      'sass.variables',
      'less.variables',
      'ios.swiftui.colors',
      'ios.swiftui.dimensions',
      'ios.swiftui.gradients',
      'ios.swiftui.shadows',
      'ios.swiftui.typography',
      'android.material.colors',
      'android.material.dimensions',
      'android.material.typography',
      'android.material.gradients',
      'android.material.shadows',
      'android.compose.colors',
      'android.compose.typography',
      'android.compose.shapes',
    ]);
  });
});

describe('createCssFormatterFactories', () => {
  it('includes the CSS formatter factories', () => {
    const factories = createCssFormatterFactories();

    expect(factories.map((factory) => factory.name)).toStrictEqual([
      'css.variables',
      'sass.variables',
      'less.variables',
    ]);
  });
});

describe('createIosSwiftUiFormatterFactories', () => {
  it('includes the SwiftUI formatter factories', () => {
    const factories = createIosSwiftUiFormatterFactories();

    expect(factories.map((factory) => factory.name)).toStrictEqual([
      'ios.swiftui.colors',
      'ios.swiftui.dimensions',
      'ios.swiftui.gradients',
      'ios.swiftui.shadows',
      'ios.swiftui.typography',
    ]);
  });
});

describe('createAndroidMaterialFormatterFactories', () => {
  it('includes the Android formatter factories', () => {
    const factories = createAndroidMaterialFormatterFactories();

    expect(factories.map((factory) => factory.name)).toStrictEqual([
      'android.material.colors',
      'android.material.dimensions',
      'android.material.typography',
      'android.material.gradients',
      'android.material.shadows',
    ]);
  });
});

describe('createAndroidComposeFormatterFactories', () => {
  it('includes the Compose formatter factories', () => {
    const factories = createAndroidComposeFormatterFactories();

    expect(factories.map((factory) => factory.name)).toStrictEqual([
      'android.compose.colors',
      'android.compose.typography',
      'android.compose.shapes',
    ]);
  });
});
