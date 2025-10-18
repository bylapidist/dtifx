import type { JsonPointer } from '@lapidist/dtif-parser';
import type { DesignTokenInterchangeFormat } from '@lapidist/dtif-schema';

/**
 * Placeholder identifiers that can be embedded within pointer templates.
 */
export type PointerPlaceholderName = 'relative' | 'basename' | 'stem' | 'source';

/**
 * Represents a placeholder segment inside a pointer template.
 */
export interface PointerPlaceholder {
  readonly kind: 'placeholder';
  readonly name: PointerPlaceholderName;
}

/**
 * A single segment in a pointer template path.
 */
export type PointerTemplateSegment = string | PointerPlaceholder;

/**
 * Describes how document pointers are constructed for token sources.
 */
export interface PointerTemplate {
  readonly base?: JsonPointer;
  readonly segments: readonly PointerTemplateSegment[];
}

/**
 * Convenience helper for creating a {@link PointerPlaceholder}.
 *
 * @param name - The placeholder name to embed in a template segment.
 * @returns The pointer placeholder descriptor.
 */
export function placeholder(name: PointerPlaceholderName): PointerPlaceholder {
  return { kind: 'placeholder', name };
}

/**
 * Build a pointer template from path segments and placeholders.
 *
 * @param segments - The ordered pointer path segments.
 * @returns The composed pointer template definition.
 */
export function pointerTemplate(...segments: PointerTemplateSegment[]): PointerTemplate {
  return { segments };
}

/**
 * Configuration describing a logical token layer.
 */
export interface TokenLayerConfig {
  readonly name: string;
  readonly context?: Readonly<Record<string, unknown>>;
}

/**
 * Base configuration shared by all token source definitions.
 */
export interface BaseTokenSourceConfig {
  readonly id: string;
  readonly layer: string;
  readonly pointerTemplate: PointerTemplate;
  readonly context?: Readonly<Record<string, unknown>>;
}

/**
 * Configuration for sources backed by file system glob patterns.
 */
export interface FileGlobTokenSourceConfig extends BaseTokenSourceConfig {
  readonly kind: 'file';
  readonly patterns: readonly string[];
  readonly ignore?: readonly string[];
  readonly rootDir?: string;
}

/**
 * Configuration for virtual sources resolved through in-memory documents.
 */
export interface VirtualTokenSourceConfig extends BaseTokenSourceConfig {
  readonly kind: 'virtual';
  readonly document: () => Promise<DesignTokenInterchangeFormat> | DesignTokenInterchangeFormat;
}

/**
 * Union of all supported token source configurations.
 */
export type TokenSourceConfig = FileGlobTokenSourceConfig | VirtualTokenSourceConfig;

/**
 * Source entry produced during token planning.
 */
export interface PlannedTokenSource {
  readonly id: string;
  readonly pointerPrefix: JsonPointer;
  readonly layer: string;
  readonly layerIndex: number;
  readonly uri: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly document: DesignTokenInterchangeFormat;
}

/**
 * Plan describing the ordered set of token sources to process.
 */
export interface TokenSourcePlan {
  readonly entries: readonly PlannedTokenSource[];
  readonly createdAt: Date;
}
