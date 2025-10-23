import {
  TokenPrefab,
  createInitialState,
  normaliseTokenPath,
  type TokenPathInput,
} from './token-prefab.js';
import type { TokenPath } from '../tokens/index.js';

export interface ImageSource {
  readonly src: string;
  readonly pixelRatio?: number;
  readonly width?: number;
  readonly height?: number;
  readonly media?: string;
  readonly format?: string;
}

export interface ImageOptions {
  readonly imageType?: string;
  readonly alt?: string;
  readonly placeholder?: string;
  readonly sources: Iterable<ImageSource>;
}

export interface ImageValue {
  readonly imageType?: string;
  readonly alt?: string;
  readonly placeholder?: string;
  readonly sources: readonly ImageSource[];
}

export interface ResponsiveImageOptions {
  readonly pixelRatios?: readonly number[];
  readonly width?: number;
  readonly height?: number;
  readonly media?: string;
  readonly format?: string;
  readonly buildSrc?: (base: string, pixelRatio: number) => string;
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export class ImageTokenPrefab extends TokenPrefab<ImageValue, ImageTokenPrefab> {
  static create(path: TokenPathInput, options: ImageOptions): ImageTokenPrefab {
    const tokenPath = normaliseTokenPath(path);
    const value = normaliseImageValue(options);
    return new ImageTokenPrefab(tokenPath, createInitialState(value));
  }

  static responsive(
    path: TokenPathInput,
    base: string,
    options: Omit<ImageOptions, 'sources'> & ResponsiveImageOptions = {},
  ): ImageTokenPrefab {
    const sources = buildResponsiveSources(base, options);
    const createOptions: Mutable<Partial<ImageOptions>> = {};
    createOptions.sources = sources;

    if (options.imageType !== undefined) {
      createOptions.imageType = options.imageType;
    }

    if (options.alt !== undefined) {
      createOptions.alt = options.alt;
    }

    if (options.placeholder !== undefined) {
      createOptions.placeholder = options.placeholder;
    }

    return ImageTokenPrefab.create(path, createOptions as ImageOptions);
  }

  private constructor(path: TokenPath, state: ReturnType<typeof createInitialState<ImageValue>>) {
    super('image', path, state);
  }

  protected create(
    path: TokenPath,
    state: ReturnType<typeof createInitialState<ImageValue>>,
  ): ImageTokenPrefab {
    return new ImageTokenPrefab(path, state);
  }

  get value(): ImageValue {
    return this.state.value;
  }

  withImageType(imageType?: string): ImageTokenPrefab {
    if (imageType === undefined) {
      return this.updateValue((current) =>
        rebuildImageValue(current, {
          clearImageType: true,
        }),
      );
    }

    return this.updateValue((current) =>
      rebuildImageValue(current, {
        imageType: normaliseImageType(imageType),
      }),
    );
  }

  withAlt(alt?: string): ImageTokenPrefab {
    if (alt === undefined) {
      return this.updateValue((current) =>
        rebuildImageValue(current, {
          clearAlt: true,
        }),
      );
    }

    return this.updateValue((current) =>
      rebuildImageValue(current, {
        alt: normaliseAltText(alt),
      }),
    );
  }

  withPlaceholder(placeholder?: string): ImageTokenPrefab {
    if (placeholder === undefined) {
      return this.updateValue((current) =>
        rebuildImageValue(current, {
          clearPlaceholder: true,
        }),
      );
    }

    return this.updateValue((current) =>
      rebuildImageValue(current, {
        placeholder: normalisePlaceholder(placeholder),
      }),
    );
  }

  withSources(sources: Iterable<ImageSource>): ImageTokenPrefab {
    return this.updateValue((current) =>
      rebuildImageValue(current, {
        sources: normaliseImageSources(sources),
      }),
    );
  }

  addSources(...sources: readonly ImageSource[]): ImageTokenPrefab {
    const combined = [...this.state.value.sources, ...sources];
    return this.withSources(combined);
  }

  withResponsiveSources(base: string, options: ResponsiveImageOptions = {}): ImageTokenPrefab {
    const sources = buildResponsiveSources(base, options);
    return this.withSources(sources);
  }
}

export const Image = {
  create: ImageTokenPrefab.create,
  responsive: ImageTokenPrefab.responsive,
};

interface ImageOverrides {
  readonly imageType?: string;
  readonly clearImageType?: boolean;
  readonly alt?: string;
  readonly clearAlt?: boolean;
  readonly placeholder?: string;
  readonly clearPlaceholder?: boolean;
  readonly sources?: readonly ImageSource[];
}

/**
 * Ensures that a pixel ratio is finite and greater than zero before recording it in metadata.
 *
 * @param pixelRatio - The candidate pixel ratio provided by the caller.
 * @throws {TypeError} When the ratio is infinite, NaN, or non-positive.
 */
export function assertValidPixelRatio(pixelRatio: number): void {
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new TypeError('Pixel ratio must be a finite number greater than zero.');
  }
}

function normaliseImageValue(options: ImageOptions): ImageValue {
  const result: Mutable<ImageValue> = {
    sources: normaliseImageSources(options.sources),
  };

  if (options.imageType !== undefined) {
    result.imageType = normaliseImageType(options.imageType);
  }

  if (options.alt !== undefined) {
    result.alt = normaliseAltText(options.alt);
  }

  if (options.placeholder !== undefined) {
    result.placeholder = normalisePlaceholder(options.placeholder);
  }

  return result;
}

function rebuildImageValue(value: ImageValue, overrides: ImageOverrides): ImageValue {
  let imageType = value.imageType;
  if (overrides.clearImageType === true) {
    imageType = undefined;
  } else if (overrides.imageType !== undefined) {
    imageType = normaliseImageType(overrides.imageType);
  }

  let alt = value.alt;
  if (overrides.clearAlt === true) {
    alt = undefined;
  } else if (overrides.alt !== undefined) {
    alt = normaliseAltText(overrides.alt);
  }

  let placeholder = value.placeholder;
  if (overrides.clearPlaceholder === true) {
    placeholder = undefined;
  } else if (overrides.placeholder !== undefined) {
    placeholder = normalisePlaceholder(overrides.placeholder);
  }

  const sources = normaliseImageSources(overrides.sources ?? value.sources);

  const result: Mutable<ImageValue> = {
    sources,
  };

  if (imageType !== undefined) {
    result.imageType = imageType;
  }

  if (alt !== undefined) {
    result.alt = alt;
  }

  if (placeholder !== undefined) {
    result.placeholder = placeholder;
  }

  return result;
}

function normaliseImageType(imageType: string): string {
  const trimmed = imageType.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Image type cannot be empty.');
  }
  return trimmed;
}

function normaliseAltText(alt: string): string {
  const trimmed = alt.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Image alt text cannot be empty.');
  }
  return trimmed;
}

function normalisePlaceholder(placeholder: string): string {
  const trimmed = placeholder.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Image placeholder cannot be empty.');
  }
  return trimmed;
}

function normaliseImageSources(sources: Iterable<ImageSource>): readonly ImageSource[] {
  const normalised: ImageSource[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    const entry = normaliseImageSource(source);
    if (!seen.has(entry.src)) {
      normalised.push(entry);
      seen.add(entry.src);
    }
  }

  if (normalised.length === 0) {
    throw new TypeError('At least one image source must be provided.');
  }

  return normalised;
}

function normaliseImageSource(source: ImageSource): ImageSource {
  const result: Mutable<ImageSource> = {
    src: normaliseSourceUri(source.src),
  };

  if (source.pixelRatio !== undefined) {
    result.pixelRatio = normalisePixelRatio(source.pixelRatio);
  }

  if (source.width !== undefined) {
    result.width = normaliseDimension('width', source.width);
  }

  if (source.height !== undefined) {
    result.height = normaliseDimension('height', source.height);
  }

  if (source.media !== undefined) {
    result.media = normaliseMediaCondition(source.media);
  }

  if (source.format !== undefined) {
    result.format = normaliseFormat(source.format);
  }

  return result;
}

function normaliseSourceUri(src: string): string {
  const trimmed = src.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Image source URI cannot be empty.');
  }
  return trimmed;
}

function normalisePixelRatio(pixelRatio: number): number {
  assertValidPixelRatio(pixelRatio);
  return pixelRatio;
}

function normaliseDimension(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`Image ${name} must be a positive, finite number.`);
  }
  return value;
}

function normaliseMediaCondition(media: string): string {
  const trimmed = media.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Image media condition cannot be empty.');
  }
  return trimmed;
}

function normaliseFormat(format: string): string {
  const trimmed = format.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Image format cannot be empty.');
  }
  return trimmed.toLowerCase();
}

function buildResponsiveSources(
  base: string,
  options: ResponsiveImageOptions,
): readonly ImageSource[] {
  const pixelRatios = normalisePixelRatios(options.pixelRatios ?? [1, 2]);
  const buildSrc = options.buildSrc ?? defaultResponsiveSrcBuilder;

  return pixelRatios.map((ratio) =>
    normaliseImageSource({
      src: buildSrc(base, ratio),
      pixelRatio: ratio,
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height }),
      ...(options.media === undefined ? {} : { media: options.media }),
      ...(options.format === undefined ? {} : { format: options.format }),
    }),
  );
}

function normalisePixelRatios(pixelRatios: readonly number[]): readonly number[] {
  const ratios = pixelRatios.map((ratio) => {
    assertValidPixelRatio(ratio);
    return ratio;
  });

  const unique = [...new Set(ratios)].toSorted((a, b) => a - b);
  if (unique.length === 0) {
    throw new TypeError('Responsive images require at least one pixel ratio.');
  }

  return unique;
}

function defaultResponsiveSrcBuilder(base: string, pixelRatio: number): string {
  if (pixelRatio === 1) {
    return normaliseSourceUri(base);
  }

  const trimmed = normaliseSourceUri(base);
  const extensionIndex = trimmed.lastIndexOf('.');
  if (extensionIndex === -1) {
    return `${trimmed}@${pixelRatio}x`;
  }

  const name = trimmed.slice(0, extensionIndex);
  const extension = trimmed.slice(extensionIndex);
  return `${name}@${pixelRatio}x${extension}`;
}
