#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const [fixturesDir, workDir, outputRelativePath, fileKey] = argv;

if (!fixturesDir || !workDir || !outputRelativePath || !fileKey) {
  process.stderr.write(
    'Usage: run-figma-cli-smoke.mjs <fixturesDir> <workDir> <outputRelativePath> <fileKey>\n',
  );
  process.exit(1);
}

const fixtureRoot = path.resolve(fixturesDir);
const workspaceRoot = path.resolve(workDir);
const outputPath = path.resolve(workspaceRoot, outputRelativePath);

const [filePayload, nodesPayload] = await Promise.all([
  readFile(path.join(fixtureRoot, 'file.json'), 'utf8'),
  readFile(path.join(fixtureRoot, 'nodes.json'), 'utf8'),
]);

const nodesDocumentMap = (() => {
  try {
    const parsed = JSON.parse(nodesPayload);
    if (parsed && typeof parsed === 'object' && parsed.nodes && typeof parsed.nodes === 'object') {
      return parsed.nodes;
    }
  } catch (error) {
    process.stderr.write(`Failed to parse nodes fixture: ${String(error)}\n`);
    process.exit(1);
  }
  return {};
})();

let parsedFilePayload;
try {
  parsedFilePayload = JSON.parse(filePayload);
} catch (error) {
  process.stderr.write(`Failed to parse file fixture: ${String(error)}\n`);
  process.exit(1);
}

const expectedToken = 'cli-smoke-token';

const server = createServer((request, response) => {
  const { method, url: requestUrl } = request;
  if (!requestUrl) {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'missing-url' }));
    return;
  }

  const url = new URL(requestUrl, 'http://127.0.0.1');

  if (method !== 'GET') {
    response.writeHead(405, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'method-not-allowed' }));
    return;
  }

  const authHeader = request.headers['authorization'];
  if (authHeader !== `Bearer ${expectedToken}`) {
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  if (url.pathname === `/v1/files/${fileKey}`) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(parsedFilePayload));
    return;
  }

  if (url.pathname === `/v1/files/${fileKey}/nodes`) {
    const idsParam = url.searchParams.get('ids') ?? '';
    const ids = idsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const entries = ids.map((id) => {
      const document = nodesDocumentMap[id];
      return [id, document];
    });

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        nodes: Object.fromEntries(entries.filter(([, document]) => document !== undefined)),
      }),
    );
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not-found', path: url.pathname }));
});

await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
if (!address || typeof address !== 'object') {
  process.stderr.write('Failed to determine server address.\n');
  process.exit(1);
}

const baseUrl = `http://127.0.0.1:${address.port}/`;

const cliEnv = {
  ...process.env,
  FIGMA_ACCESS_TOKEN: expectedToken,
};

const child = spawn(
  'pnpm',
  [
    'exec',
    'dtifx',
    'extract',
    'figma',
    '--file',
    fileKey,
    '--output',
    outputPath,
    '--api-base',
    baseUrl,
  ],
  {
    cwd: workspaceRoot,
    env: cliEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let stdout = '';
let stderr = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  stdout += chunk;
  process.stdout.write(chunk);
});
child.stderr.on('data', (chunk) => {
  stderr += chunk;
  process.stderr.write(chunk);
});

const [exitCode] = await once(child, 'exit');

await new Promise((resolve) => server.close(resolve));

if ((exitCode ?? 1) !== 0) {
  process.stderr.write(`dtifx extract exited with code ${exitCode ?? 'unknown'}.\n`);
  process.exit(exitCode ?? 1);
}

if (!stdout.includes('Extracted Figma tokens to')) {
  process.stderr.write('CLI output did not include extraction confirmation.\n');
  process.exit(1);
}

let document;
try {
  const raw = await readFile(outputPath, 'utf8');
  document = JSON.parse(raw);
} catch (error) {
  process.stderr.write(`Failed to read extracted token file: ${String(error)}\n`);
  process.exit(1);
}

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

try {
  const colorToken = document?.color?.surface?.background;
  assert(colorToken?.$type === 'color', 'Color token type mismatch.');
  const colorComponents = colorToken?.$value?.components;
  assert(Array.isArray(colorComponents), 'Color token components missing.');
  assert(Math.abs(colorComponents[0] - 0.125) < 1e-6, 'Color token red component mismatch.');
  assert(Math.abs(colorComponents[1] - 0.2) < 1e-6, 'Color token green component mismatch.');
  assert(Math.abs(colorComponents[2] - 0.35) < 1e-6, 'Color token blue component mismatch.');
  assert(
    colorToken?.$value?.alpha && Math.abs(colorToken.$value.alpha - 0.76) < 1e-2,
    'Color token alpha mismatch.',
  );
  assert(
    colorToken?.$extensions?.['net.lapidist.sources.figma']?.styleKey === 'color-style-key',
    'Color token extension missing style key.',
  );

  const gradientToken = document?.gradient?.hero?.primary;
  assert(gradientToken?.$type === 'gradient', 'Gradient token type mismatch.');
  const stops = gradientToken?.$value?.stops;
  assert(Array.isArray(stops) && stops.length === 3, 'Gradient token stops mismatch.');
  assert(gradientToken?.$value?.angle > 0, 'Gradient token angle missing.');

  const typographyToken = document?.typography?.heading?.h1;
  assert(typographyToken?.$type === 'typography', 'Typography token type mismatch.');
  assert(typographyToken?.$value?.fontFamily === 'inter', 'Typography font family mismatch.');
  assert(typographyToken?.$value?.fontSize?.value === 24, 'Typography font size mismatch.');
  assert(typographyToken?.$value?.color?.hex === '#F23333', 'Typography color hex mismatch.');

  const assetToken = document?.asset?.illustration?.hero;
  assert(assetToken?.$type === 'string', 'Asset token type mismatch.');
  assert(
    typeof assetToken?.$value === 'string' &&
      assetToken.$value.includes(`/v1/images/${fileKey}`) &&
      assetToken.$value.includes('format=png'),
    'Asset token image URL mismatch.',
  );

  process.stdout.write('Figma extraction smoke test passed.\n');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
