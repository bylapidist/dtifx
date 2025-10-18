import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const thresholds = { branches: 75, functions: 90, lines: 85, statements: 85 };
const metricOrder = [
  ['Statements', 'statements'],
  ['Branches', 'branches'],
  ['Functions', 'functions'],
  ['Lines', 'lines'],
];

const workspaceRoot = path.resolve(__dirname, '..');
const packagesDir = path.resolve(workspaceRoot, 'packages');
const outputDir = path.resolve(workspaceRoot, 'coverage');
const outputFile = path.resolve(outputDir, 'coverage-comment.md');

async function readCoverageSummary(packageName) {
  const summaryPaths = [
    path.resolve(packagesDir, packageName, 'coverage', 'coverage-summary.json'),
    path.resolve(workspaceRoot, 'coverage', packageName, 'coverage-summary.json'),
    path.resolve(workspaceRoot, 'coverage', 'packages', packageName, 'coverage-summary.json'),
  ];

  for (const summaryPath of summaryPaths) {
    try {
      const contents = await readFile(summaryPath, 'utf8');
      return JSON.parse(contents);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        continue;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read coverage summary for ${packageName}: ${message}`);
    }
  }
}

function formatMetricRow(name, summaryKey, coverage) {
  const data = coverage.total?.[summaryKey];

  if (!data || typeof data.pct !== 'number') {
    return `| ${name} | n/a | ${thresholds[summaryKey] ?? 'n/a'}% | ❔ |`;
  }

  const percentage = data.pct.toFixed(2);
  const threshold = thresholds[summaryKey];
  const status = typeof threshold === 'number' ? (data.pct >= threshold ? '✅' : '❌') : '';

  return `| ${name} | ${percentage}% (${data.covered}/${data.total}) | ${threshold ?? 'n/a'}% | ${status} |`;
}

function buildCoverageTable(coverage) {
  const rows = metricOrder.map(([label, key]) => formatMetricRow(label, key, coverage));
  const header = ['| Metric | Coverage | Threshold | Status |', '| --- | --- | --- | --- |'];

  return [...header, ...rows].join('\n');
}

async function generateComment() {
  const entries = await readdir(packagesDir, { withFileTypes: true });

  const packagesWithCoverage = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const coverage = await readCoverageSummary(entry.name);

    if (!coverage) {
      console.warn(`No coverage summary found for ${entry.name}. Skipping.`);
      continue;
    }

    packagesWithCoverage.push({ name: entry.name, coverage });
  }

  packagesWithCoverage.sort((a, b) => a.name.localeCompare(b.name));

  let content = '### Coverage Summary\n\n';

  content +=
    packagesWithCoverage.length === 0
      ? 'No coverage reports were generated.'
      : packagesWithCoverage
          .map(({ name, coverage }) => `#### ${name}\n\n${buildCoverageTable(coverage)}\n`)
          .join('\n');

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputFile, `${content}\n`, 'utf8');
}

try {
  await generateComment();
  console.log(`Coverage comment generated at ${path.relative(workspaceRoot, outputFile)}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
