import type { JsonPointer } from '@lapidist/dtif-parser';

export interface PolicyTokenProvenance {
  readonly sourceId: string;
  readonly layer: string;
  readonly layerIndex: number;
  readonly uri: string;
  readonly pointerPrefix: JsonPointer;
}

export interface PolicyTokenMetadata {
  readonly extensions: Readonly<Record<string, unknown>>;
  readonly deprecated?: unknown;
  readonly tags?: readonly string[];
}

export interface PolicyTokenResolution {
  readonly value?: unknown;
}

export interface PolicyTokenDefinition {
  readonly id?: string;
  readonly type?: string;
  readonly value?: unknown;
  readonly raw?: unknown;
}

export interface PolicyTokenSnapshot<
  TToken extends PolicyTokenDefinition = PolicyTokenDefinition,
  TMetadata extends PolicyTokenMetadata | undefined = PolicyTokenMetadata | undefined,
  TResolution extends PolicyTokenResolution | undefined = PolicyTokenResolution | undefined,
> {
  readonly pointer: JsonPointer;
  readonly sourcePointer?: JsonPointer;
  readonly token: TToken;
  readonly metadata?: TMetadata;
  readonly resolution?: TResolution;
  readonly provenance: PolicyTokenProvenance;
  readonly context: Readonly<Record<string, unknown>>;
}

export type TokenSnapshot = PolicyTokenSnapshot;
