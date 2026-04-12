/**
 * Input options for the DSCP document generator.
 */
export interface GenerateOptions {
  /** Path to the dtifx build output directory containing resolved token files. */
  from: string;
  /** Path to write the generated DESIGN_SYSTEM.md document. */
  out: string;
}

/**
 * A single token entry included in the DSCP output.
 */
export interface DSCPToken {
  readonly id: string;
  readonly pointer: string;
  readonly name: string;
  readonly type?: string;
  readonly value?: unknown;
}

/**
 * A section of the DSCP document grouping tokens by type.
 */
export interface DSCPSection {
  readonly type: string;
  readonly tokens: readonly DSCPToken[];
}

/**
 * The structured representation of a generated DSCP document.
 */
export interface DSCPDocument {
  readonly version: 1;
  readonly generatedAt: string;
  readonly sections: readonly DSCPSection[];
}
