/**
 * Supported option kinds that can be configured within build definitions.
 */
export type ConfigOptionKind = 'transform' | 'formatter' | 'policy';

/**
 * Ensure the provided value is a plain object and clone it to avoid mutations.
 * @param {unknown} value - The candidate value supplied in configuration.
 * @param {string} name - The configuration section currently being processed.
 * @returns {Record<string, unknown>} A shallow copy of the validated plain object.
 */
export function assertPlainObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(
      `Configuration options for "${name}" must be an object of key/value pairs.`,
    );
  }
  return { ...(value as Record<string, unknown>) };
}

/**
 * Confirm that only recognised option keys are provided for a configuration entry.
 * @param {Record<string, unknown>} value - The configuration object being inspected.
 * @param {ReadonlySet<string>} allowed - The set of keys allowed for the given entry.
 * @param {string} name - The name of the configuration element being validated.
 * @param {ConfigOptionKind} kind - The type of configuration being parsed.
 */
export function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  name: string,
  kind: ConfigOptionKind,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new TypeError(`Unknown ${kind} option "${key}" supplied for "${name}".`);
    }
  }
}

/**
 * Validate that an option is a finite number and return it as-is.
 * @param {unknown} value - The candidate option value supplied by the user.
 * @param {string} name - The name of the configuration element being validated.
 * @param {string} option - The specific option key being inspected.
 * @returns {number} The validated numeric value.
 */
export function assertNumberOption(value: unknown, name: string, option: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new TypeError(
      `Option "${option}" for "${name}" must be a finite number. Received ${String(value)}.`,
    );
  }
  return value;
}

/**
 * Validate that an option is a string and return it unmodified.
 * @param {unknown} value - The candidate option value supplied by the user.
 * @param {string} name - The name of the configuration element being validated.
 * @param {string} option - The specific option key being inspected.
 * @returns {string} The validated string value.
 */
export function assertStringOption(value: unknown, name: string, option: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(
      `Option "${option}" for "${name}" must be a string. Received ${String(value)}.`,
    );
  }
  return value;
}

/**
 * Validate that an option is an array of strings and return a cloned copy.
 * @param {unknown} value - The candidate option value supplied by the user.
 * @param {string} name - The name of the configuration element being validated.
 * @param {string} option - The specific option key being inspected.
 * @returns {readonly string[]} A new array containing the validated string values.
 */
export function assertStringArrayOption(
  value: unknown,
  name: string,
  option: string,
): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new TypeError(
      `Option "${option}" for "${name}" must be an array of strings. Received ${JSON.stringify(value)}.`,
    );
  }
  const array = value as readonly string[];
  return array.map((entry) => entry);
}
