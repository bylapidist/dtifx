import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { __testing } from '../../src/tools/diff/compare-command-runner.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stubModuleUrl = pathToFileURL(
  path.resolve(__dirname, '../fixtures/diff/mock-diff-module.ts'),
).href;

__testing.setDiffModuleImporter(() => import(stubModuleUrl));

await import('../../src/bin.ts');
