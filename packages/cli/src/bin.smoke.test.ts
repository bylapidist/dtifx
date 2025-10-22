import { execFile } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliProjectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(cliProjectRoot, '..', '..');
const coreProjectRoot = path.resolve(cliProjectRoot, '..', 'core');
const diffProjectRoot = path.resolve(cliProjectRoot, '..', 'diff');
const buildProjectRoot = path.resolve(cliProjectRoot, '..', 'build');
const auditProjectRoot = path.resolve(cliProjectRoot, '..', 'audit');
const extractorsProjectRoot = path.resolve(cliProjectRoot, '..', 'extractors');

const runPnpm = async (args: string[], options: { cwd: string }) => {
  return await execFileAsync('pnpm', args, {
    cwd: options.cwd,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
};

const readManifest = async (projectRoot: string) => {
  const manifestPath = path.join(projectRoot, 'package.json');
  const manifestContent = await readFile(manifestPath, 'utf8');
  return JSON.parse(manifestContent) as { name: string; version: string };
};

const findTarballPath = (
  files: string[],
  packDirectory: string,
  manifest: { name: string; version: string },
) => {
  const sanitizedName = manifest.name.replace(/^@/, '').replaceAll('/', '-');
  const tarballPrefix = `${sanitizedName}-${manifest.version}`;
  const tarballName = files.find((file) => file.startsWith(tarballPrefix) && file.endsWith('.tgz'));

  if (!tarballName) {
    throw new Error(`Failed to locate tarball for ${manifest.name}@${manifest.version}.`);
  }

  return path.join(packDirectory, tarballName);
};

describe('dtifx CLI distribution', () => {
  test('packs, installs, and exposes the help output', async () => {
    const packWorkspace = await mkdtemp(path.join(tmpdir(), 'dtifx-cli-pack-'));
    const installWorkspace = await mkdtemp(path.join(tmpdir(), 'dtifx-cli-install-'));

    try {
      const packagesToPack = [
        { project: 'core', root: coreProjectRoot },
        { project: 'diff', root: diffProjectRoot },
        { project: 'build', root: buildProjectRoot },
        { project: 'audit', root: auditProjectRoot },
        { project: 'extractors', root: extractorsProjectRoot },
        { project: 'cli', root: cliProjectRoot },
      ];

      const manifests = await Promise.all(
        packagesToPack.map(async ({ root }) => ({ manifest: await readManifest(root), root })),
      );

      const projectList = packagesToPack.map(({ project }) => project).join(',');
      await runPnpm(['exec', 'nx', 'run-many', '--target', 'build', '--projects', projectList], {
        cwd: workspaceRoot,
      });

      for (const { root } of packagesToPack) {
        await runPnpm(['pack', '--pack-destination', packWorkspace], { cwd: root });
      }

      const packFiles = await readdir(packWorkspace);

      const dependencyEntries = manifests.map(
        ({ manifest }) =>
          [manifest.name, `file:${findTarballPath(packFiles, packWorkspace, manifest)}`] as const,
      );

      const dependencyMap = Object.fromEntries(dependencyEntries);

      await writeFile(
        path.join(installWorkspace, 'package.json'),
        JSON.stringify(
          {
            name: 'cli-smoke-project',
            version: '0.0.0',
            private: true,
            pnpm: {
              overrides: dependencyMap,
            },
            dependencies: dependencyMap,
          },
          undefined,
          2,
        ),
        'utf8',
      );
      await runPnpm(['install'], { cwd: installWorkspace });

      const { stdout } = await runPnpm(['exec', 'dtifx', '--help'], { cwd: installWorkspace });

      expect(stdout).toContain('Usage: dtifx');

      const buildFixturesRoot = path.resolve(buildProjectRoot, 'tests', 'fixtures', 'cli-smoke');
      await cp(buildFixturesRoot, installWorkspace, { recursive: true });

      const { stdout: generateHuman } = await runPnpm(
        ['exec', 'dtifx', 'build', 'generate', '--config', 'dtifx.config.json'],
        { cwd: installWorkspace },
      );

      expect(generateHuman).toContain('Generated 12 artifacts for 8 tokens');
      expect(generateHuman).toContain('dist/css/tokens.css');
      expect(generateHuman).toContain('dist/sass/tokens.scss');
      expect(generateHuman).toContain('dist/less/tokens.less');
      expect(generateHuman).toContain('dist/modules/tokens.js');
      expect(generateHuman).toContain('dist/modules/tokens.d.ts');
      expect(generateHuman).toContain('dist/modules/tokens.ts');
      expect(generateHuman).toContain('dist/ios/ColorTokens.swift');
      expect(generateHuman).toContain('dist/android/values/colors.xml');
      expect(generateHuman).toContain(
        'dist/android/compose/src/main/java/com/example/tokens/ComposeColorTokens.kt',
      );
      expect(generateHuman).toContain(
        'dist/android/compose/src/main/java/com/example/tokens/ComposeTypographyTokens.kt',
      );
      expect(generateHuman).toContain(
        'dist/android/compose/src/main/java/com/example/tokens/ComposeShapeTokens.kt',
      );
      expect(generateHuman).toContain('dist/json/tokens.json');

      const readArtifact = async (relativePath: string) =>
        await readFile(path.join(installWorkspace, relativePath), 'utf8');

      const cssOutput = await readArtifact(path.join('dist', 'css', 'tokens.css'));
      expect(cssOutput).toContain('--tokens-foundation-color-brand: oklch');
      expect(cssOutput).toContain('--tokens-product-color-cta: oklch');

      const sassOutput = await readArtifact(path.join('dist', 'sass', 'tokens.scss'));
      expect(sassOutput).toContain('$tokens-foundation-color-brand: oklch');
      expect(sassOutput).toContain('$tokens-product-color-cta: oklch');

      const lessOutput = await readArtifact(path.join('dist', 'less', 'tokens.less'));
      expect(lessOutput).toContain('@tokens-foundation-color-brand: oklch');
      expect(lessOutput).toContain('@tokens-product-color-cta: oklch');

      const jsModuleOutput = await readArtifact(path.join('dist', 'modules', 'tokens.js'));
      expect(jsModuleOutput).toContain('export const moduleTokens');
      expect(jsModuleOutput).toContain('export const tokens = moduleTokens.tokens');

      const jsDeclarationOutput = await readArtifact(path.join('dist', 'modules', 'tokens.d.ts'));
      expect(jsDeclarationOutput).toContain('export declare const moduleTokens');

      const tsModuleOutput = await readArtifact(path.join('dist', 'modules', 'tokens.ts'));
      expect(tsModuleOutput).toContain('export const moduleTokens');

      const swiftOutput = await readArtifact(path.join('dist', 'ios', 'ColorTokens.swift'));
      expect(swiftOutput).toContain('struct ColorTokens');
      expect(swiftOutput).toContain('public static let tokensProductColorCta = Color');

      const androidOutput = await readArtifact(
        path.join('dist', 'android', 'values', 'colors.xml'),
      );
      expect(androidOutput).toContain(
        '<color name="tokens_foundation_color_brand">#ff1f578f</color>',
      );

      const jsonOutputRaw = await readArtifact(path.join('dist', 'json', 'tokens.json'));
      const jsonOutput = JSON.parse(jsonOutputRaw) as {
        readonly tokens: {
          readonly foundation: {
            readonly colorBrand?: { readonly type?: string };
            readonly typographyBody?: { readonly type?: string };
          };
          readonly product: {
            readonly colorCta?: { readonly value?: { readonly colorSpace?: string } };
            readonly shapeCard?: { readonly type?: string };
          };
        };
      };
      expect(jsonOutput.tokens.foundation.colorBrand?.type).toBe('color');
      expect(jsonOutput.tokens.foundation.typographyBody?.type).toBe('typography');
      expect(jsonOutput.tokens.product.colorCta?.value?.colorSpace).toBe('srgb');
      expect(jsonOutput.tokens.product.shapeCard?.type).toBe('border');

      const { stdout: generateJson } = await runPnpm(
        [
          'exec',
          'dtifx',
          'build',
          'generate',
          '--config',
          'dtifx.config.json',
          '--reporter',
          'json',
          '--json-logs',
        ],
        { cwd: installWorkspace },
      );

      const jsonLines = generateJson
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const buildCompletedLine = jsonLines.find((line) =>
        line.includes('"event":"build.completed"'),
      );
      expect(buildCompletedLine).toBeDefined();

      const buildCompletedPayload = JSON.parse(buildCompletedLine!) as {
        readonly artifactCount: number;
        readonly formatters: ReadonlyArray<{
          readonly id: string;
          readonly artifacts: ReadonlyArray<{
            readonly path: string;
            readonly metadata?: Readonly<Record<string, unknown>>;
            readonly written?: { readonly relative: string };
          }>;
        }>;
      };

      expect(buildCompletedPayload.artifactCount).toBe(12);

      const formatterMap = new Map(
        buildCompletedPayload.formatters.map((formatter) => [formatter.name, formatter]),
      );

      const cssFormatter = formatterMap.get('css.variables');
      expect(cssFormatter?.artifacts[0]?.written?.relative).toBe('dist/css/tokens.css');
      expect(cssFormatter?.artifacts[0]?.metadata).toMatchObject({ declarationCount: 6 });

      const sassFormatter = formatterMap.get('sass.variables');
      expect(sassFormatter?.artifacts[0]?.written?.relative).toBe('dist/sass/tokens.scss');
      expect(sassFormatter?.artifacts[0]?.metadata).toMatchObject({ declarationCount: 6 });

      const lessFormatter = formatterMap.get('less.variables');
      expect(lessFormatter?.artifacts[0]?.written?.relative).toBe('dist/less/tokens.less');
      expect(lessFormatter?.artifacts[0]?.metadata).toMatchObject({ declarationCount: 6 });

      const javascriptFormatter = formatterMap.get('javascript.module');
      expect(javascriptFormatter?.artifacts).toHaveLength(2);
      expect(javascriptFormatter?.artifacts[0]?.written?.relative).toBe('dist/modules/tokens.d.ts');
      expect(javascriptFormatter?.artifacts[1]?.written?.relative).toBe('dist/modules/tokens.js');
      expect(javascriptFormatter?.artifacts[0]?.metadata).toMatchObject({
        language: 'typescript',
        namedExportCount: 1,
        role: 'declaration',
        tokenCount: 2,
      });
      expect(javascriptFormatter?.artifacts[1]?.metadata).toMatchObject({
        language: 'javascript',
        namedExportCount: 1,
        role: 'module',
        tokenCount: 2,
      });

      const typescriptFormatter = formatterMap.get('typescript.module');
      expect(typescriptFormatter?.artifacts[0]?.written?.relative).toBe('dist/modules/tokens.ts');
      expect(typescriptFormatter?.artifacts[0]?.metadata).toMatchObject({
        language: 'typescript',
        namedExportCount: 0,
        role: 'module',
        tokenCount: 8,
      });

      const iosFormatter = formatterMap.get('ios.swiftui.colors');
      expect(iosFormatter?.artifacts[0]?.written?.relative).toBe('dist/ios/ColorTokens.swift');
      expect(iosFormatter?.artifacts[0]?.metadata).toMatchObject({ colorCount: 4 });

      const androidFormatter = formatterMap.get('android.material.colors');
      expect(androidFormatter?.artifacts[0]?.written?.relative).toBe(
        'dist/android/values/colors.xml',
      );
      expect(androidFormatter?.artifacts[0]?.metadata).toMatchObject({ colorCount: 4 });

      const composeColorFormatter = formatterMap.get('android.compose.colors');
      expect(composeColorFormatter?.artifacts[0]?.written?.relative).toBe(
        'dist/android/compose/src/main/java/com/example/tokens/ComposeColorTokens.kt',
      );
      expect(composeColorFormatter?.artifacts[0]?.metadata).toMatchObject({ colorCount: 4 });

      const composeTypographyFormatter = formatterMap.get('android.compose.typography');
      expect(composeTypographyFormatter?.artifacts[0]?.written?.relative).toBe(
        'dist/android/compose/src/main/java/com/example/tokens/ComposeTypographyTokens.kt',
      );
      expect(composeTypographyFormatter?.artifacts[0]?.metadata).toMatchObject({
        typographyCount: 1,
      });

      const composeShapeFormatter = formatterMap.get('android.compose.shapes');
      expect(composeShapeFormatter?.artifacts[0]?.written?.relative).toBe(
        'dist/android/compose/src/main/java/com/example/tokens/ComposeShapeTokens.kt',
      );
      expect(composeShapeFormatter?.artifacts[0]?.metadata).toMatchObject({
        shapeCount: 1,
      });

      const jsonFormatter = formatterMap.get('json.snapshot');
      expect(jsonFormatter?.artifacts[0]?.written?.relative).toBe('dist/json/tokens.json');
      expect(jsonFormatter?.artifacts[0]?.metadata).toMatchObject({ tokenCount: 8 });
    } finally {
      await rm(packWorkspace, { recursive: true, force: true });
      await rm(installWorkspace, { recursive: true, force: true });
    }
  }, 180_000);
});
