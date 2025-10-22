#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_ROOT="$(cd "${PACKAGE_ROOT}/../.." && pwd)"

if [[ -z "${PKG:-}" ]]; then
  echo "PKG environment variable must be set to the npm pack artifact" >&2
  exit 1
fi

CLI_PKG_PATH=""
CLI_PKG_CLEANUP_PATH=""
CORE_PKG_CLEANUP_PATH=""
BUILD_PKG_PATH=""
BUILD_PKG_CLEANUP_PATH=""
DIFF_PKG_PATH=""
DIFF_PKG_CLEANUP_PATH=""
EXTRACTORS_PKG_PATH=""
EXTRACTORS_PKG_CLEANUP_PATH=""

if [[ -z "${CLI_PKG:-}" ]]; then
  CLI_PACKAGE_ROOT="${WORKSPACE_ROOT}/packages/cli"
  if [[ ! -d "${CLI_PACKAGE_ROOT}" ]]; then
    echo "CLI_PKG environment variable must point to the @dtifx/cli npm pack artifact" >&2
    exit 1
  fi

  echo "CLI_PKG not provided; building and packing @dtifx/cli" >&2
  pnpm exec nx run-many -t build --projects core,cli --output-style=static >&2

  # shellcheck source=../../../scripts/lib/package-utils.sh
  source "${WORKSPACE_ROOT}/scripts/lib/package-utils.sh"

  CLI_PKG_PATH="$(pack_workspace_package "${CLI_PACKAGE_ROOT}")"
  CLI_PKG="${CLI_PKG_PATH}"
  CLI_PKG_CLEANUP_PATH="${CLI_PKG_PATH}"

  if [[ -z "${CORE_PKG:-}" ]]; then
    CORE_PACKAGE_ROOT="${WORKSPACE_ROOT}/packages/core"
    if [[ -d "${CORE_PACKAGE_ROOT}" ]]; then
      CORE_PKG_PATH="$(pack_workspace_package "${CORE_PACKAGE_ROOT}")"
      CORE_PKG="${CORE_PKG_PATH}"
      CORE_PKG_CLEANUP_PATH="${CORE_PKG_PATH}"
    fi
  fi
  if [[ -z "${EXTRACTORS_PKG:-}" ]]; then
    EXTRACTORS_PACKAGE_ROOT="${WORKSPACE_ROOT}/packages/extractors"
    if [[ -d "${EXTRACTORS_PACKAGE_ROOT}" ]]; then
      EXTRACTORS_PKG_PATH="$(pack_workspace_package "${EXTRACTORS_PACKAGE_ROOT}")"
      EXTRACTORS_PKG="${EXTRACTORS_PKG_PATH}"
      EXTRACTORS_PKG_CLEANUP_PATH="${EXTRACTORS_PKG_PATH}"
    fi
  fi
else
  if [[ "${CLI_PKG}" = /* ]]; then
    CLI_PKG_PATH="${CLI_PKG}"
  else
    CLI_PKG_PATH="${WORKSPACE_ROOT}/${CLI_PKG}"
  fi
fi

if [[ -z "${EXTRACTORS_PKG:-}" && -z "${EXTRACTORS_PKG_PATH}" ]]; then
  EXTRACTORS_PACKAGE_ROOT="${WORKSPACE_ROOT}/packages/extractors"
  if [[ -d "${EXTRACTORS_PACKAGE_ROOT}" ]]; then
    if ! declare -f pack_workspace_package >/dev/null 2>&1; then
      # shellcheck source=../../../scripts/lib/package-utils.sh
      source "${WORKSPACE_ROOT}/scripts/lib/package-utils.sh"
    fi
    EXTRACTORS_PKG_PATH="$(pack_workspace_package "${EXTRACTORS_PACKAGE_ROOT}")"
    EXTRACTORS_PKG="${EXTRACTORS_PKG_PATH}"
    EXTRACTORS_PKG_CLEANUP_PATH="${EXTRACTORS_PKG_PATH}"
  fi
fi

if [[ -z "${BUILD_PKG:-}" ]]; then
  BUILD_PACKAGE_ROOT="${WORKSPACE_ROOT}/packages/build"
  if [[ -d "${BUILD_PACKAGE_ROOT}" ]]; then
    if ! declare -f pack_workspace_package >/dev/null; then
      # shellcheck source=../../../scripts/lib/package-utils.sh
      source "${WORKSPACE_ROOT}/scripts/lib/package-utils.sh"
    fi
    BUILD_PKG_PATH="$(pack_workspace_package "${BUILD_PACKAGE_ROOT}")"
    BUILD_PKG="${BUILD_PKG_PATH}"
    BUILD_PKG_CLEANUP_PATH="${BUILD_PKG_PATH}"
  fi
else
  if [[ "${BUILD_PKG}" = /* ]]; then
    BUILD_PKG_PATH="${BUILD_PKG}"
  else
    BUILD_PKG_PATH="${WORKSPACE_ROOT}/${BUILD_PKG}"
  fi
fi

if [[ -z "${DIFF_PKG:-}" ]]; then
  DIFF_PACKAGE_ROOT="${WORKSPACE_ROOT}/packages/diff"
  if [[ -d "${DIFF_PACKAGE_ROOT}" ]]; then
    if ! declare -f pack_workspace_package >/dev/null; then
      # shellcheck source=../../../scripts/lib/package-utils.sh
      source "${WORKSPACE_ROOT}/scripts/lib/package-utils.sh"
    fi
    DIFF_PKG_PATH="$(pack_workspace_package "${DIFF_PACKAGE_ROOT}")"
    DIFF_PKG="${DIFF_PKG_PATH}"
    DIFF_PKG_CLEANUP_PATH="${DIFF_PKG_PATH}"
  fi
else
  if [[ "${DIFF_PKG}" = /* ]]; then
    DIFF_PKG_PATH="${DIFF_PKG}"
  else
    DIFF_PKG_PATH="${WORKSPACE_ROOT}/${DIFF_PKG}"
  fi
fi

if [[ "${PKG}" = /* ]]; then
  PKG_PATH="${PKG}"
else
  PKG_PATH="${WORKSPACE_ROOT}/${PKG}"
fi

if [[ ! -f "${PKG_PATH}" ]]; then
  echo "Resolved PKG path ${PKG_PATH} does not exist" >&2
  exit 1
fi

if [[ ! -f "${CLI_PKG_PATH}" ]]; then
  echo "Resolved CLI_PKG path ${CLI_PKG_PATH} does not exist" >&2
  exit 1
fi

if [[ -n "${EXTRACTORS_PKG_PATH}" && ! -f "${EXTRACTORS_PKG_PATH}" ]]; then
  echo "Resolved EXTRACTORS_PKG path ${EXTRACTORS_PKG_PATH} does not exist" >&2
  exit 1
fi

CORE_PKG_PATH=""
if [[ -n "${CORE_PKG:-}" ]]; then
  if [[ "${CORE_PKG}" = /* ]]; then
    CORE_PKG_PATH="${CORE_PKG}"
  else
    CORE_PKG_PATH="${WORKSPACE_ROOT}/${CORE_PKG}"
  fi
  if [[ ! -f "${CORE_PKG_PATH}" ]]; then
    echo "CORE_PKG path ${CORE_PKG_PATH} does not exist" >&2
    exit 1
  fi
fi

if [[ -n "${BUILD_PKG_PATH}" ]] && [[ ! -f "${BUILD_PKG_PATH}" ]]; then
  echo "BUILD_PKG path ${BUILD_PKG_PATH} does not exist" >&2
  exit 1
fi

if [[ -n "${DIFF_PKG_PATH}" ]] && [[ ! -f "${DIFF_PKG_PATH}" ]]; then
  echo "DIFF_PKG path ${DIFF_PKG_PATH} does not exist" >&2
  exit 1
fi

if [[ -n "${EXTRACTORS_PKG:-}" ]]; then
  if [[ "${EXTRACTORS_PKG}" = /* ]]; then
    EXTRACTORS_PKG_PATH="${EXTRACTORS_PKG}"
  else
    EXTRACTORS_PKG_PATH="${WORKSPACE_ROOT}/${EXTRACTORS_PKG}"
  fi
  if [[ ! -f "${EXTRACTORS_PKG_PATH}" ]]; then
    echo "EXTRACTORS_PKG path ${EXTRACTORS_PKG_PATH} does not exist" >&2
    exit 1
  fi
fi

WORK_DIR="${PACKAGE_ROOT}/tmp/cli-smoke"
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}"

FIXTURES_DIR="${PACKAGE_ROOT}/tests/fixtures/cli-smoke"
if [[ ! -d "${FIXTURES_DIR}" ]]; then
  echo "CLI smoke fixtures not found at ${FIXTURES_DIR}" >&2
  exit 1
fi

cleanup() {
  local status=${1:-$?}
  rm -rf "${WORK_DIR}" 2>/dev/null || true
  if [[ -n "${CLI_PKG_CLEANUP_PATH}" ]]; then
    rm -f "${CLI_PKG_CLEANUP_PATH}" 2>/dev/null || true
  fi
  if [[ -n "${CORE_PKG_CLEANUP_PATH}" ]]; then
    rm -f "${CORE_PKG_CLEANUP_PATH}" 2>/dev/null || true
  fi
  if [[ -n "${BUILD_PKG_CLEANUP_PATH}" ]]; then
    rm -f "${BUILD_PKG_CLEANUP_PATH}" 2>/dev/null || true
  fi
  if [[ -n "${DIFF_PKG_CLEANUP_PATH}" ]]; then
    rm -f "${DIFF_PKG_CLEANUP_PATH}" 2>/dev/null || true
  fi
  if [[ -n "${EXTRACTORS_PKG_CLEANUP_PATH}" ]]; then
    rm -f "${EXTRACTORS_PKG_CLEANUP_PATH}" 2>/dev/null || true
  fi
  exit "$status"
}
trap 'cleanup $?' EXIT

run_and_capture() {
  local output_file="$1"
  shift
  local command_display
  command_display=$(printf '%q ' "$@")
  command_display="${command_display% }"
  echo "--- Running: ${command_display} (capturing to ${output_file}) ---"
  "$@" | tee "${output_file}"
  echo "--- End of ${output_file} ---"
}

assert_contains() {
  local file="$1"
  local expected="$2"
  if ! grep -Fq -- "$expected" "$file"; then
    echo "Expected '$expected' in $file" >&2
    exit 1
  fi
}

wait_for_file() {
  local file="$1"
  local timeout="${2:-60}"
  local start="$SECONDS"
  while [[ ! -f "$file" ]]; do
    if (( SECONDS - start >= timeout )); then
      echo "Timed out waiting for file $file" >&2
      exit 1
    fi
    sleep 0.2
  done
}

parse_json_from_file() {
  local file="$1"
  JSON_FILE="$file" node - <<'NODE'
const fs = require('node:fs');
const filePath = process.env.JSON_FILE;
if (!filePath) {
  throw new Error('JSON_FILE environment variable not provided');
}
const raw = fs.readFileSync(filePath, 'utf8');
const lines = raw
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .filter((line) => line.length > 0);
const firstJsonIndex = lines.findIndex((line) => {
  const trimmed = line.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
});
if (firstJsonIndex === -1) {
  throw new Error(`No JSON payload detected in ${filePath}`);
}
const jsonLines = [];
for (let index = firstJsonIndex; index < lines.length; index += 1) {
  const line = lines[index];
  const trimmedStart = line.trimStart();
  if (trimmedStart.startsWith('--- ')) {
    break;
  }
  if (trimmedStart.startsWith('{"level"')) {
    continue;
  }
  if (trimmedStart.includes('|  WARN')) {
    continue;
  }
  jsonLines.push(line);
}
const payload = jsonLines.join('\n');
const parsed = JSON.parse(payload);
process.stdout.write(JSON.stringify(parsed));
NODE
}

pushd "${WORK_DIR}" >/dev/null

node - <<'NODE' "${WORKSPACE_ROOT}" "${PKG_PATH}" "${CLI_PKG_PATH}" "${CORE_PKG_PATH}" "${BUILD_PKG_PATH}" "${DIFF_PKG_PATH}" "${EXTRACTORS_PKG_PATH}"
const fs = require('node:fs');
const path = require('node:path');

const [workspaceRoot, auditPath, cliPath, corePath, buildPath, diffPath, extractorsPath] = process.argv.slice(2);
const pkg = {
  name: 'dtifx-audit-cli-smoke',
  version: '0.0.0',
  private: true,
  type: 'module',
};

const ensureFileSpecifier = (input) => {
  if (!input) {
    return undefined;
  }
  return input.startsWith('file:') ? input : `file:${input}`;
};

const overrides = {};
const devDependencies = {};

try {
  const rootPkg = JSON.parse(
    fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'),
  );
  if (typeof rootPkg.packageManager === 'string' && rootPkg.packageManager.length > 0) {
    pkg.packageManager = rootPkg.packageManager;
  }
} catch (error) {
  if ((error && typeof error === 'object' && 'code' in error ? error.code : undefined) !== 'ENOENT') {
    throw error;
  }
}

const auditSpecifier = ensureFileSpecifier(auditPath);
if (auditSpecifier) {
  devDependencies['@dtifx/audit'] = auditSpecifier;
  overrides['@dtifx/audit'] = auditSpecifier;
}

const cliSpecifier = ensureFileSpecifier(cliPath);
if (cliSpecifier) {
  devDependencies['@dtifx/cli'] = cliSpecifier;
  overrides['@dtifx/cli'] = cliSpecifier;
}

const coreSpecifier = ensureFileSpecifier(corePath);
if (coreSpecifier) {
  devDependencies['@dtifx/core'] = coreSpecifier;
  overrides['@dtifx/core'] = coreSpecifier;
}

const buildSpecifier = ensureFileSpecifier(buildPath);
if (buildSpecifier) {
  devDependencies['@dtifx/build'] = buildSpecifier;
  overrides['@dtifx/build'] = buildSpecifier;
}

const diffSpecifier = ensureFileSpecifier(diffPath);
if (diffSpecifier) {
  devDependencies['@dtifx/diff'] = diffSpecifier;
  overrides['@dtifx/diff'] = diffSpecifier;
}

const extractorsSpecifier = ensureFileSpecifier(extractorsPath);
if (extractorsSpecifier) {
  devDependencies['@dtifx/extractors'] = extractorsSpecifier;
  overrides['@dtifx/extractors'] = extractorsSpecifier;
}

if (Object.keys(devDependencies).length > 0) {
  pkg.devDependencies = {
    ...(pkg.devDependencies ?? {}),
    ...devDependencies,
  };
}

if (Object.keys(overrides).length > 0) {
  const existingOverrides =
    pkg.pnpm && typeof pkg.pnpm === 'object' && pkg.pnpm !== null && typeof pkg.pnpm.overrides === 'object'
      ? pkg.pnpm.overrides
      : {};
  pkg.pnpm = {
    ...(pkg.pnpm ?? {}),
    overrides: {
      ...existingOverrides,
      ...overrides,
    },
  };
}

fs.writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
NODE

pnpm install \
  --ignore-workspace \
  --shared-workspace-lockfile=false \
  --link-workspace-packages=false \
  --no-frozen-lockfile \
  --ignore-scripts \
  >/dev/null

cp -R "${FIXTURES_DIR}/." .

run_and_capture help.txt pnpm exec dtifx audit --help
assert_contains help.txt 'Usage: dtifx audit [options] [command]'
assert_contains help.txt 'Commands:'
assert_contains help.txt 'run [options]'

run_and_capture run-human.txt \
  pnpm exec dtifx audit run --config dtifx.config.json
assert_contains run-human.txt 'Audit completed with 2 violation(s) across 2 policies.'
assert_contains run-human.txt '#/tokens/product/colorCta'
assert_contains run-human.txt '#/tokens/product/spacingCompact'

run_and_capture run-json.txt \
  pnpm exec dtifx audit run --config dtifx.config.json --reporter json --json-logs
run_json_payload=$(parse_json_from_file run-json.txt)
if ! echo "$run_json_payload" | grep -F '"status":"warn"' >/dev/null; then
  echo 'JSON audit output missing warn status' >&2
  exit 1
fi
if ! echo "$run_json_payload" | grep -F '"violationCount":2' >/dev/null; then
  echo 'JSON audit output missing violation count' >&2
  exit 1
fi

run_and_capture run-markdown.txt \
  pnpm exec dtifx audit run --config dtifx.config.json --reporter markdown --timings --json-logs
assert_contains run-markdown.txt '# dtifx Audit Report'
assert_contains run-markdown.txt '- **Status:** WARN'
assert_contains run-markdown.txt '## Violations'

run_and_capture telemetry-stdout.txt \
  pnpm exec dtifx audit run \
    --config dtifx.config.json \
    --reporter json \
    --telemetry stdout \
    --json-logs
assert_contains telemetry-stdout.txt '"event":"audit.completed"'
assert_contains telemetry-stdout.txt '"name":"dtifx.cli.audit"'

popd >/dev/null
