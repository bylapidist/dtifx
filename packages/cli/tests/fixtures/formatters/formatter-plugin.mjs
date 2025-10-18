/**
 * Register integration test formatter factories used by CLI coverage.
 * @param {{ registry: { register(factory: unknown): void }; options?: { fileName?: string } }} context -
 *   Formatter plugin context provided by the build runtime.
 */
export function registerFormatters({ registry, options }) {
  const fileName = typeof options?.fileName === 'string' ? options.fileName : 'formatter.txt';
  registry.register({
    name: 'fixture.uppercase',
    create(entry) {
      return {
        name: entry.name,
        selector: {},
        async run({ tokens }) {
          const prefix = typeof entry.options?.prefix === 'string' ? entry.options.prefix : '';
          const lines = tokens.map((token) => {
            let value = token?.value;
            if (token && typeof token.value === 'object' && token.value !== null) {
              value = 'value' in token.value ? token.value.value : token.value;
            }
            return `${prefix}${String(value ?? '').toUpperCase()}`;
          });
          return [
            {
              path: fileName,
              contents: lines.join('\n'),
              encoding: 'utf8',
              metadata: { plugin: 'fixture.uppercase' },
            },
          ];
        },
      };
    },
  });
}
