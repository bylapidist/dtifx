#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_ROOT="$(cd "${PACKAGE_ROOT}/../.." && pwd)"

PKG_PATH=""
PKG_CLEANUP_PATH=""

if [[ -z "${PKG:-}" ]]; then
  echo "PKG not provided; building and packing @dtifx/extractors" >&2
  pnpm exec nx run-many -t build --projects core,cli,extractors --output-style=static >&2

  # shellcheck source=../../../scripts/lib/package-utils.sh
  source "${WORKSPACE_ROOT}/scripts/lib/package-utils.sh"

  PKG_PATH="$(pack_workspace_package "${PACKAGE_ROOT}")"
  PKG="${PKG_PATH}"
  PKG_CLEANUP_PATH="${PKG_PATH}"
else
  if [[ "${PKG}" = /* ]]; then
    PKG_PATH="${PKG}"
  else
    PKG_PATH="${WORKSPACE_ROOT}/${PKG}"
  fi
fi

CLI_PKG_PATH=""
CLI_PKG_CLEANUP_PATH=""
CORE_PKG_PATH=""
CORE_PKG_CLEANUP_PATH=""

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
else
  if [[ "${CLI_PKG}" = /* ]]; then
    CLI_PKG_PATH="${CLI_PKG}"
  else
    CLI_PKG_PATH="${WORKSPACE_ROOT}/${CLI_PKG}"
  fi
fi

if [[ -z "${CORE_PKG:-}" && -z "${CORE_PKG_PATH}" ]]; then
  CORE_PACKAGE_ROOT="${WORKSPACE_ROOT}/packages/core"
  if [[ -d "${CORE_PACKAGE_ROOT}" ]]; then
    if ! command -v pack_workspace_package >/dev/null 2>&1; then
      # shellcheck source=../../../scripts/lib/package-utils.sh
      source "${WORKSPACE_ROOT}/scripts/lib/package-utils.sh"
    fi
    CORE_PKG_PATH="$(pack_workspace_package "${CORE_PACKAGE_ROOT}")"
    CORE_PKG="${CORE_PKG_PATH}"
    CORE_PKG_CLEANUP_PATH="${CORE_PKG_PATH}"
  fi
fi

if [[ ! -f "${PKG_PATH}" ]]; then
  echo "Resolved PKG path ${PKG_PATH} does not exist" >&2
  exit 1
fi

if [[ ! -f "${CLI_PKG_PATH}" ]]; then
  echo "Resolved CLI_PKG path ${CLI_PKG_PATH} does not exist" >&2
  exit 1
fi

if [[ -n "${CORE_PKG}" ]]; then
  if [[ "${CORE_PKG}" = /* ]]; then
    CORE_PKG_PATH="${CORE_PKG}"
  else
    CORE_PKG_PATH="${WORKSPACE_ROOT}/${CORE_PKG}"
  fi
fi

if [[ -n "${CORE_PKG_PATH}" && ! -f "${CORE_PKG_PATH}" ]]; then
  echo "Resolved CORE_PKG path ${CORE_PKG_PATH} does not exist" >&2
  exit 1
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
  if [[ -n "${PKG_CLEANUP_PATH}" ]]; then
    rm -f "${PKG_CLEANUP_PATH}" 2>/dev/null || true
  fi
  if [[ -n "${CLI_PKG_CLEANUP_PATH}" ]]; then
    rm -f "${CLI_PKG_CLEANUP_PATH}" 2>/dev/null || true
  fi
  if [[ -n "${CORE_PKG_CLEANUP_PATH}" ]]; then
    rm -f "${CORE_PKG_CLEANUP_PATH}" 2>/dev/null || true
  fi
  exit "$status"
}
trap 'cleanup $?' EXIT

pushd "${WORK_DIR}" >/dev/null

node - <<'NODE' "${WORKSPACE_ROOT}" "${PKG_PATH}" "${CLI_PKG_PATH}" "${CORE_PKG_PATH}"
const fs = require('node:fs');
const path = require('node:path');

const [workspaceRoot, extractorsPath, cliPath, corePath] = process.argv.slice(2);

const pkg = {
  name: 'dtifx-extractors-cli-smoke',
  version: '0.0.0',
  private: true,
  type: 'module',
};

try {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'));
  if (rootPkg && typeof rootPkg.packageManager === 'string' && rootPkg.packageManager.length > 0) {
    pkg.packageManager = rootPkg.packageManager;
  }
} catch (error) {
  if ((error && typeof error === 'object' && 'code' in error ? error.code : undefined) !== 'ENOENT') {
    throw error;
  }
}

const ensureFileSpecifier = (value) => {
  if (!value) {
    return undefined;
  }

  return value.startsWith('file:') ? value : `file:${value}`;
};

const devDependencies = {};
const overrides = {};

const extractorsSpecifier = ensureFileSpecifier(extractorsPath);
if (extractorsSpecifier) {
  devDependencies['@dtifx/extractors'] = extractorsSpecifier;
  overrides['@dtifx/extractors'] = extractorsSpecifier;
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
  --link-workspace-packages=false \
  --shared-workspace-lockfile=false \
  --no-frozen-lockfile \
  --ignore-scripts \
  >/dev/null

pnpm exec dtifx extract --help >/dev/null
pnpm exec dtifx extract figma --help >/dev/null

node "${PACKAGE_ROOT}/scripts/run-figma-cli-smoke.mjs" "${FIXTURES_DIR}" "${WORK_DIR}" "tokens/cli-smoke.figma.json" "cli-smoke-file"

popd >/dev/null
