import { createRequire } from 'node:module';
import path from 'node:path';

const PACKAGE_NAME = '@dtifx/diff';

export const loadDiffPackageVersion = (): string | undefined => {
  const require = createRequire(import.meta.url);

  try {
    const entryPoint = require.resolve(PACKAGE_NAME);
    let directory = path.dirname(entryPoint);

    while (true) {
      const manifestPath = path.join(directory, 'package.json');

      try {
        const manifest = require(manifestPath) as { name?: string; version?: string };
        if (manifest.name === PACKAGE_NAME && manifest.version) {
          return manifest.version;
        }
      } catch {
        // Continue walking up the directory tree when the manifest is not present.
      }

      const parentDirectory = path.dirname(directory);
      if (parentDirectory === directory) {
        return;
      }

      directory = parentDirectory;
    }
  } catch {
    return;
  }
};
