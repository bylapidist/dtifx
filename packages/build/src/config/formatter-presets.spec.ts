import { describe, expect, it } from 'vitest';

import type { FormatterInstanceConfig } from './index.js';
import {
  createAndroidComposeFormatterPreset,
  createAndroidMaterialFormatterPreset,
  createCssFormatterPreset,
  createFormatterPreset,
  createJavascriptModuleFormatterPreset,
  createLessFormatterPreset,
  createIosSwiftUiFormatterPreset,
  createJsonFormatterPreset,
  createSassFormatterPreset,
  createTypescriptModuleFormatterPreset,
} from './formatter-presets.js';

function assertFormatter(
  instance: FormatterInstanceConfig,
  name: string,
  directory: string,
  options?: Readonly<Record<string, unknown>>,
  id?: string,
): void {
  expect(instance.name).toBe(name);
  expect(instance.output).toEqual({ directory });
  if (options === undefined) {
    expect(instance.options).toBeUndefined();
  } else {
    expect(instance.options).toEqual(options);
    expect(instance.options).not.toBe(options);
  }
  if (id === undefined) {
    expect(instance.id).toBeUndefined();
  } else {
    expect(instance.id).toBe(id);
  }
}

describe('createJsonFormatterPreset', () => {
  it('returns the JSON formatter entry with defaults', () => {
    const preset = createJsonFormatterPreset();

    expect(preset).toHaveLength(1);
    assertFormatter(preset[0]!, 'json.snapshot', 'dist/json');
  });

  it('applies overrides for the JSON formatter', () => {
    const preset = createJsonFormatterPreset({
      baseDirectory: 'snapshots',
      snapshot: {
        id: 'json-snapshot',
        output: { directory: 'artifacts/json' },
        options: { filename: 'tokens.json' },
      },
    });

    expect(preset).toHaveLength(1);
    assertFormatter(
      preset[0]!,
      'json.snapshot',
      'artifacts/json',
      { filename: 'tokens.json' },
      'json-snapshot',
    );
  });

  it('falls back to base directory when override output is undefined', () => {
    const preset = createJsonFormatterPreset({
      baseDirectory: 'dist/snapshots',
      snapshot: { output: {} },
    });

    expect(preset).toHaveLength(1);
    assertFormatter(preset[0]!, 'json.snapshot', 'dist/snapshots');
  });
});

describe('createJavascriptModuleFormatterPreset', () => {
  it('returns the JavaScript module formatter entry with defaults', () => {
    const preset = createJavascriptModuleFormatterPreset();

    expect(preset).toHaveLength(1);
    assertFormatter(preset[0]!, 'javascript.module', 'dist/js');
  });

  it('applies overrides for the JavaScript module formatter', () => {
    const preset = createJavascriptModuleFormatterPreset({
      baseDirectory: 'modules/js',
      module: {
        id: 'js-module',
        output: { directory: 'dist/modules' },
        options: { filename: 'tokens.js', rootIdentifier: 'libraryTokens' },
      },
    });

    expect(preset).toHaveLength(1);
    assertFormatter(
      preset[0]!,
      'javascript.module',
      'dist/modules',
      { filename: 'tokens.js', rootIdentifier: 'libraryTokens' },
      'js-module',
    );
  });

  it('falls back to the base directory when override output is undefined', () => {
    const preset = createJavascriptModuleFormatterPreset({
      baseDirectory: 'artifacts/js',
      module: { output: {} },
    });

    expect(preset).toHaveLength(1);
    assertFormatter(preset[0]!, 'javascript.module', 'artifacts/js');
  });
});

describe('createTypescriptModuleFormatterPreset', () => {
  it('returns the TypeScript module formatter entry with defaults', () => {
    const preset = createTypescriptModuleFormatterPreset();

    expect(preset).toHaveLength(1);
    assertFormatter(preset[0]!, 'typescript.module', 'dist/ts');
  });

  it('applies overrides for the TypeScript module formatter', () => {
    const preset = createTypescriptModuleFormatterPreset({
      baseDirectory: 'modules/ts',
      module: {
        id: 'ts-module',
        output: { directory: 'dist/modules' },
        options: { filename: 'tokens.ts', namedExports: true },
      },
    });

    expect(preset).toHaveLength(1);
    assertFormatter(
      preset[0]!,
      'typescript.module',
      'dist/modules',
      { filename: 'tokens.ts', namedExports: true },
      'ts-module',
    );
  });

  it('falls back to the base directory when override output is undefined', () => {
    const preset = createTypescriptModuleFormatterPreset({
      baseDirectory: 'artifacts/ts',
      module: { output: {} },
    });

    expect(preset).toHaveLength(1);
    assertFormatter(preset[0]!, 'typescript.module', 'artifacts/ts');
  });
});

describe('createCssFormatterPreset', () => {
  it('returns the CSS formatter entry with defaults', () => {
    const preset = createCssFormatterPreset();
    expect(preset).toHaveLength(1);
    assertFormatter(preset[0]!, 'css.variables', 'dist/css');
  });

  it('applies overrides for the CSS formatter', () => {
    const preset = createCssFormatterPreset({
      baseDirectory: 'public/css',
      variables: {
        id: 'custom-css',
        output: { directory: 'assets/css' },
        options: { filename: 'tokens.css' },
      },
    });

    expect(preset).toHaveLength(1);
    assertFormatter(
      preset[0]!,
      'css.variables',
      'assets/css',
      { filename: 'tokens.css' },
      'custom-css',
    );
  });

  it('falls back to base directory when override output is undefined', () => {
    const preset = createCssFormatterPreset({
      baseDirectory: 'lib/css',
      variables: {
        output: {},
      },
    });

    expect(preset).toHaveLength(1);
    assertFormatter(preset[0]!, 'css.variables', 'lib/css');
  });
});

describe('createSassFormatterPreset', () => {
  it('returns the Sass formatter entry with defaults', () => {
    const preset = createSassFormatterPreset();
    expect(preset).toHaveLength(1);
    assertFormatter(preset[0]!, 'sass.variables', 'dist/sass');
  });

  it('applies overrides for the Sass formatter', () => {
    const preset = createSassFormatterPreset({
      baseDirectory: 'styles/sass',
      variables: {
        id: 'sass-vars',
        output: { directory: 'assets/sass' },
        options: { filename: '_tokens.scss' },
      },
    });

    expect(preset).toHaveLength(1);
    assertFormatter(
      preset[0]!,
      'sass.variables',
      'assets/sass',
      { filename: '_tokens.scss' },
      'sass-vars',
    );
  });

  it('falls back to base directory when override output is undefined', () => {
    const preset = createSassFormatterPreset({
      baseDirectory: 'dist/sass-tokens',
      variables: { output: {} },
    });

    expect(preset).toHaveLength(1);
    assertFormatter(preset[0]!, 'sass.variables', 'dist/sass-tokens');
  });
});

describe('createLessFormatterPreset', () => {
  it('returns the Less formatter entry with defaults', () => {
    const preset = createLessFormatterPreset();
    expect(preset).toHaveLength(1);
    assertFormatter(preset[0]!, 'less.variables', 'dist/less');
  });

  it('applies overrides for the Less formatter', () => {
    const preset = createLessFormatterPreset({
      baseDirectory: 'styles/less',
      variables: {
        id: 'less-vars',
        output: { directory: 'assets/less' },
        options: { prefix: 'theme' },
      },
    });

    expect(preset).toHaveLength(1);
    assertFormatter(preset[0]!, 'less.variables', 'assets/less', { prefix: 'theme' }, 'less-vars');
  });

  it('falls back to base directory when override output is undefined', () => {
    const preset = createLessFormatterPreset({
      baseDirectory: 'dist/less-tokens',
      variables: { output: {} },
    });

    expect(preset).toHaveLength(1);
    assertFormatter(preset[0]!, 'less.variables', 'dist/less-tokens');
  });
});

describe('createIosSwiftUiFormatterPreset', () => {
  it('returns SwiftUI formatter entries with defaults', () => {
    const preset = createIosSwiftUiFormatterPreset();
    expect(preset).toHaveLength(5);
    assertFormatter(preset[0]!, 'ios.swiftui.colors', 'dist/ios');
    assertFormatter(preset[1]!, 'ios.swiftui.dimensions', 'dist/ios');
    assertFormatter(preset[2]!, 'ios.swiftui.typography', 'dist/ios');
    assertFormatter(preset[3]!, 'ios.swiftui.gradients', 'dist/ios');
    assertFormatter(preset[4]!, 'ios.swiftui.shadows', 'dist/ios');
  });

  it('applies overrides to individual SwiftUI formatters', () => {
    const preset = createIosSwiftUiFormatterPreset({
      baseDirectory: 'ios',
      colors: { id: 'colors', options: { filename: 'Colors.swift' } },
      typography: { output: { directory: 'ios/text' } },
    });

    expect(preset).toHaveLength(5);
    assertFormatter(
      preset[0]!,
      'ios.swiftui.colors',
      'ios',
      { filename: 'Colors.swift' },
      'colors',
    );
    assertFormatter(preset[1]!, 'ios.swiftui.dimensions', 'ios');
    assertFormatter(preset[2]!, 'ios.swiftui.typography', 'ios/text');
    assertFormatter(preset[3]!, 'ios.swiftui.gradients', 'ios');
    assertFormatter(preset[4]!, 'ios.swiftui.shadows', 'ios');
  });
});

describe('createAndroidMaterialFormatterPreset', () => {
  it('returns Android formatter entries with defaults', () => {
    const preset = createAndroidMaterialFormatterPreset();
    expect(preset).toHaveLength(5);
    assertFormatter(preset[0]!, 'android.material.colors', 'dist/android');
    assertFormatter(preset[1]!, 'android.material.dimensions', 'dist/android');
    assertFormatter(preset[2]!, 'android.material.typography', 'dist/android');
    assertFormatter(preset[3]!, 'android.material.gradients', 'dist/android');
    assertFormatter(preset[4]!, 'android.material.shadows', 'dist/android');
  });

  it('applies overrides to Android formatters', () => {
    const preset = createAndroidMaterialFormatterPreset({
      baseDirectory: 'android',
      colors: { options: { filename: 'values/colors.xml' } },
      gradients: { output: { directory: 'android/src' } },
      shadows: { id: 'shadows' },
    });

    expect(preset).toHaveLength(5);
    assertFormatter(preset[0]!, 'android.material.colors', 'android', {
      filename: 'values/colors.xml',
    });
    assertFormatter(preset[1]!, 'android.material.dimensions', 'android');
    assertFormatter(preset[2]!, 'android.material.typography', 'android');
    assertFormatter(preset[3]!, 'android.material.gradients', 'android/src');
    assertFormatter(preset[4]!, 'android.material.shadows', 'android', undefined, 'shadows');
  });
});

describe('createAndroidComposeFormatterPreset', () => {
  it('returns Compose formatter entries with defaults', () => {
    const preset = createAndroidComposeFormatterPreset();
    expect(preset).toHaveLength(3);
    assertFormatter(preset[0]!, 'android.compose.colors', 'dist/android/compose');
    assertFormatter(preset[1]!, 'android.compose.typography', 'dist/android/compose');
    assertFormatter(preset[2]!, 'android.compose.shapes', 'dist/android/compose');
  });

  it('applies overrides to Compose formatters', () => {
    const preset = createAndroidComposeFormatterPreset({
      baseDirectory: 'android/compose',
      colors: { options: { filename: 'ComposeColors.kt' } },
      shapes: { output: { directory: 'android/compose/shapes' } },
    });

    expect(preset).toHaveLength(3);
    assertFormatter(preset[0]!, 'android.compose.colors', 'android/compose', {
      filename: 'ComposeColors.kt',
    });
    assertFormatter(preset[1]!, 'android.compose.typography', 'android/compose');
    assertFormatter(preset[2]!, 'android.compose.shapes', 'android/compose/shapes');
  });
});

describe('createFormatterPreset', () => {
  it('returns an empty array when no presets are requested', () => {
    expect(createFormatterPreset()).toEqual([]);
  });

  it('concatenates presets for all requested platforms', () => {
    const preset = createFormatterPreset({
      json: { baseDirectory: 'json' },
      javascriptModule: { baseDirectory: 'modules/js' },
      typescriptModule: { baseDirectory: 'modules/ts' },
      css: { baseDirectory: 'css' },
      sass: { baseDirectory: 'scss' },
      less: { baseDirectory: 'less' },
      iosSwiftUi: { baseDirectory: 'ios' },
      androidMaterial: { baseDirectory: 'android' },
      androidCompose: { baseDirectory: 'android/compose' },
    });

    expect(preset).toHaveLength(19);
    assertFormatter(preset[0]!, 'json.snapshot', 'json');
    assertFormatter(preset[1]!, 'javascript.module', 'modules/js');
    assertFormatter(preset[2]!, 'typescript.module', 'modules/ts');
    assertFormatter(preset[3]!, 'css.variables', 'css');
    assertFormatter(preset[4]!, 'sass.variables', 'scss');
    assertFormatter(preset[5]!, 'less.variables', 'less');
    assertFormatter(preset[6]!, 'ios.swiftui.colors', 'ios');
    assertFormatter(preset[7]!, 'ios.swiftui.dimensions', 'ios');
    assertFormatter(preset[8]!, 'ios.swiftui.typography', 'ios');
    assertFormatter(preset[9]!, 'ios.swiftui.gradients', 'ios');
    assertFormatter(preset[10]!, 'ios.swiftui.shadows', 'ios');
    assertFormatter(preset[11]!, 'android.material.colors', 'android');
    assertFormatter(preset[12]!, 'android.material.dimensions', 'android');
    assertFormatter(preset[13]!, 'android.material.typography', 'android');
    assertFormatter(preset[14]!, 'android.material.gradients', 'android');
    assertFormatter(preset[15]!, 'android.material.shadows', 'android');
    assertFormatter(preset[16]!, 'android.compose.colors', 'android/compose');
    assertFormatter(preset[17]!, 'android.compose.typography', 'android/compose');
    assertFormatter(preset[18]!, 'android.compose.shapes', 'android/compose');
  });
});
