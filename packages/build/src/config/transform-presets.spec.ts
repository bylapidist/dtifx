import { describe, expect, it } from 'vitest';

import type { TransformConfigEntry } from './index.js';
import {
  createAndroidComposeTransformPreset,
  createAndroidMaterialTransformPreset,
  createCssTransformPreset,
  createIosSwiftUiTransformPreset,
  createTransformPreset,
} from './transform-presets.js';

function assertTransform(
  entry: TransformConfigEntry,
  name: string,
  group: string | undefined,
  options?: Readonly<Record<string, unknown>>,
): void {
  expect(entry.name).toBe(name);
  if (group === undefined) {
    expect(entry.group).toBeUndefined();
  } else {
    expect(entry.group).toBe(group);
  }
  if (options === undefined) {
    expect(entry.options).toBeUndefined();
  } else {
    expect(entry.options).toEqual(options);
    expect(entry.options).not.toBe(options);
  }
}

describe('createCssTransformPreset', () => {
  it('returns CSS transform entries with defaults', () => {
    const preset = createCssTransformPreset();

    expect(preset).toHaveLength(7);
    assertTransform(preset[0]!, 'color.toCss', 'web/base');
    assertTransform(preset[1]!, 'dimension.toRem', 'web/base');
    assertTransform(preset[2]!, 'dimension.toPx', 'web/base');
    assertTransform(preset[3]!, 'gradient.toCss', 'web/base');
    assertTransform(preset[4]!, 'shadow.toCss', 'web/base');
    assertTransform(preset[5]!, 'border.toCss', 'web/base');
    assertTransform(preset[6]!, 'typography.toCss', 'web/base');
  });

  it('applies overrides to CSS transform entries', () => {
    const preset = createCssTransformPreset({
      baseGroup: 'custom/web',
      dimensionToPx: { group: 'custom/px' },
      gradientToCss: { options: { precision: 5 } },
      shadowToCss: { group: 'custom/shadows' },
      borderToCss: { group: 'custom/borders' },
    });

    expect(preset).toHaveLength(7);
    assertTransform(preset[0]!, 'color.toCss', 'custom/web');
    assertTransform(preset[1]!, 'dimension.toRem', 'custom/web');
    assertTransform(preset[2]!, 'dimension.toPx', 'custom/px');
    assertTransform(preset[3]!, 'gradient.toCss', 'custom/web', { precision: 5 });
    assertTransform(preset[4]!, 'shadow.toCss', 'custom/shadows');
    assertTransform(preset[5]!, 'border.toCss', 'custom/borders');
    assertTransform(preset[6]!, 'typography.toCss', 'custom/web');
  });
});

describe('createIosSwiftUiTransformPreset', () => {
  it('returns SwiftUI transform entries with defaults', () => {
    const preset = createIosSwiftUiTransformPreset();

    expect(preset).toHaveLength(5);
    assertTransform(preset[0]!, 'color.toSwiftUIColor', 'ios/swiftui');
    assertTransform(preset[1]!, 'dimension.toSwiftUiPoints', 'ios/swiftui');
    assertTransform(preset[2]!, 'gradient.toSwiftUI', 'ios/swiftui');
    assertTransform(preset[3]!, 'shadow.toSwiftUI', 'ios/swiftui');
    assertTransform(preset[4]!, 'typography.toSwiftUI', 'ios/swiftui');
  });

  it('applies overrides to SwiftUI transform entries', () => {
    const preset = createIosSwiftUiTransformPreset({
      baseGroup: 'swiftui',
      colorToSwiftUIColor: { options: { variants: true } },
      shadowToSwiftUi: { group: 'swiftui/shadows' },
    });

    expect(preset).toHaveLength(5);
    assertTransform(preset[0]!, 'color.toSwiftUIColor', 'swiftui', { variants: true });
    assertTransform(preset[1]!, 'dimension.toSwiftUiPoints', 'swiftui');
    assertTransform(preset[2]!, 'gradient.toSwiftUI', 'swiftui');
    assertTransform(preset[3]!, 'shadow.toSwiftUI', 'swiftui/shadows');
    assertTransform(preset[4]!, 'typography.toSwiftUI', 'swiftui');
  });
});

describe('createAndroidMaterialTransformPreset', () => {
  it('returns Android transform entries with defaults', () => {
    const preset = createAndroidMaterialTransformPreset();

    expect(preset).toHaveLength(6);
    assertTransform(preset[0]!, 'color.toAndroidArgb', 'android/material');
    assertTransform(preset[1]!, 'dimension.toAndroidDp', 'android/material');
    assertTransform(preset[2]!, 'dimension.toAndroidSp', 'android/material');
    assertTransform(preset[3]!, 'gradient.toAndroidMaterial', 'android/material');
    assertTransform(preset[4]!, 'shadow.toAndroidMaterial', 'android/material');
    assertTransform(preset[5]!, 'typography.toAndroidMaterial', 'android/material');
  });

  it('applies overrides to Android transform entries', () => {
    const preset = createAndroidMaterialTransformPreset({
      baseGroup: 'android',
      colorToAndroidArgb: { group: 'android/colors' },
      dimensionToAndroidSp: { options: { baseFontSize: 16 } },
    });

    expect(preset).toHaveLength(6);
    assertTransform(preset[0]!, 'color.toAndroidArgb', 'android/colors');
    assertTransform(preset[1]!, 'dimension.toAndroidDp', 'android');
    assertTransform(preset[2]!, 'dimension.toAndroidSp', 'android', { baseFontSize: 16 });
    assertTransform(preset[3]!, 'gradient.toAndroidMaterial', 'android');
    assertTransform(preset[4]!, 'shadow.toAndroidMaterial', 'android');
    assertTransform(preset[5]!, 'typography.toAndroidMaterial', 'android');
  });
});

describe('createAndroidComposeTransformPreset', () => {
  it('returns Compose transform entries with defaults', () => {
    const preset = createAndroidComposeTransformPreset();

    expect(preset).toHaveLength(3);
    assertTransform(preset[0]!, 'color.toAndroidComposeColor', 'android/compose');
    assertTransform(preset[1]!, 'border.toAndroidComposeShape', 'android/compose');
    assertTransform(preset[2]!, 'typography.toAndroidCompose', 'android/compose');
  });

  it('applies overrides to Compose transform entries', () => {
    const preset = createAndroidComposeTransformPreset({
      baseGroup: 'compose',
      borderToAndroidComposeShape: { group: 'compose/shapes' },
    });

    expect(preset).toHaveLength(3);
    assertTransform(preset[0]!, 'color.toAndroidComposeColor', 'compose');
    assertTransform(preset[1]!, 'border.toAndroidComposeShape', 'compose/shapes');
    assertTransform(preset[2]!, 'typography.toAndroidCompose', 'compose');
  });
});

describe('createTransformPreset', () => {
  it('returns an empty array when no presets are selected', () => {
    expect(createTransformPreset()).toEqual([]);
  });

  it('concatenates presets across requested platforms', () => {
    const preset = createTransformPreset({
      css: { baseGroup: 'css' },
      iosSwiftUi: { baseGroup: 'ios' },
      androidMaterial: { baseGroup: 'android' },
      androidCompose: { baseGroup: 'compose' },
    });

    expect(preset).toHaveLength(21);
    assertTransform(preset[0]!, 'color.toCss', 'css');
    assertTransform(preset[1]!, 'dimension.toRem', 'css');
    assertTransform(preset[2]!, 'dimension.toPx', 'css');
    assertTransform(preset[3]!, 'gradient.toCss', 'css');
    assertTransform(preset[4]!, 'shadow.toCss', 'css');
    assertTransform(preset[5]!, 'border.toCss', 'css');
    assertTransform(preset[6]!, 'typography.toCss', 'css');
    assertTransform(preset[7]!, 'color.toSwiftUIColor', 'ios');
    assertTransform(preset[8]!, 'dimension.toSwiftUiPoints', 'ios');
    assertTransform(preset[9]!, 'gradient.toSwiftUI', 'ios');
    assertTransform(preset[10]!, 'shadow.toSwiftUI', 'ios');
    assertTransform(preset[11]!, 'typography.toSwiftUI', 'ios');
    assertTransform(preset[12]!, 'color.toAndroidArgb', 'android');
    assertTransform(preset[13]!, 'dimension.toAndroidDp', 'android');
    assertTransform(preset[14]!, 'dimension.toAndroidSp', 'android');
    assertTransform(preset[15]!, 'gradient.toAndroidMaterial', 'android');
    assertTransform(preset[16]!, 'shadow.toAndroidMaterial', 'android');
    assertTransform(preset[17]!, 'typography.toAndroidMaterial', 'android');
    assertTransform(preset[18]!, 'color.toAndroidComposeColor', 'compose');
    assertTransform(preset[19]!, 'border.toAndroidComposeShape', 'compose');
    assertTransform(preset[20]!, 'typography.toAndroidCompose', 'compose');
  });
});
