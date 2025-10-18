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
BUILD_PKG_PATH=""
BUILD_PKG_CLEANUP_PATH=""
CORE_PKG_CLEANUP_PATH=""
AUDIT_PKG_PATH=""
AUDIT_PKG_CLEANUP_PATH=""

if [[ -z "${CLI_PKG:-}" ]]; then
  CLI_PACKAGE_ROOT="${WORKSPACE_ROOT}/packages/cli"
  if [[ ! -d "${CLI_PACKAGE_ROOT}" ]]; then
    echo "CLI_PKG environment variable must point to the @dtifx/cli npm pack artifact" >&2
    exit 1
  fi

  echo "CLI_PKG not provided; building and packing @dtifx/cli" >&2
  pnpm exec nx run-many -t build --projects core,cli,build --output-style=static >&2

  # shellcheck source=../../../scripts/lib/package-utils.sh
  source "${WORKSPACE_ROOT}/scripts/lib/package-utils.sh"

  CLI_PKG_PATH="$(pack_workspace_package "${CLI_PACKAGE_ROOT}")"
  CLI_PKG="${CLI_PKG_PATH}"
  CLI_PKG_CLEANUP_PATH="${CLI_PKG_PATH}"

  if [[ -z "${BUILD_PKG:-}" ]]; then
    BUILD_PACKAGE_ROOT="${WORKSPACE_ROOT}/packages/build"
    if [[ -d "${BUILD_PACKAGE_ROOT}" ]]; then
      BUILD_PKG_PATH="$(pack_workspace_package "${BUILD_PACKAGE_ROOT}")"
      BUILD_PKG="${BUILD_PKG_PATH}"
      BUILD_PKG_CLEANUP_PATH="${BUILD_PKG_PATH}"
    fi
  fi

  if [[ -z "${CORE_PKG:-}" ]]; then
    CORE_PACKAGE_ROOT="${WORKSPACE_ROOT}/packages/core"
    if [[ -d "${CORE_PACKAGE_ROOT}" ]]; then
      CORE_PKG_PATH="$(pack_workspace_package "${CORE_PACKAGE_ROOT}")"
      CORE_PKG="${CORE_PKG_PATH}"
      CORE_PKG_CLEANUP_PATH="${CORE_PKG_PATH}"
    fi
  fi

  if [[ -z "${AUDIT_PKG:-}" ]]; then
    AUDIT_PACKAGE_ROOT="${WORKSPACE_ROOT}/packages/audit"
    if [[ -d "${AUDIT_PACKAGE_ROOT}" ]]; then
      AUDIT_PKG_PATH="$(pack_workspace_package "${AUDIT_PACKAGE_ROOT}")"
      AUDIT_PKG="${AUDIT_PKG_PATH}"
      AUDIT_PKG_CLEANUP_PATH="${AUDIT_PKG_PATH}"
    fi
  fi
else
  if [[ "${CLI_PKG}" = /* ]]; then
    CLI_PKG_PATH="${CLI_PKG}"
  else
    CLI_PKG_PATH="${WORKSPACE_ROOT}/${CLI_PKG}"
  fi
fi

if [[ -z "${AUDIT_PKG:-}" && -z "${AUDIT_PKG_PATH}" ]]; then
  AUDIT_PACKAGE_ROOT="${WORKSPACE_ROOT}/packages/audit"
  if [[ -d "${AUDIT_PACKAGE_ROOT}" ]]; then
    if ! command -v pack_workspace_package >/dev/null 2>&1; then
      # shellcheck source=../../../scripts/lib/package-utils.sh
      source "${WORKSPACE_ROOT}/scripts/lib/package-utils.sh"
    fi

    AUDIT_PKG_PATH="$(pack_workspace_package "${AUDIT_PACKAGE_ROOT}")"
    AUDIT_PKG="${AUDIT_PKG_PATH}"
    AUDIT_PKG_CLEANUP_PATH="${AUDIT_PKG_PATH}"
  fi
fi

if [[ -n "${BUILD_PKG:-}" ]]; then
  if [[ "${BUILD_PKG}" = /* ]]; then
    BUILD_PKG_PATH="${BUILD_PKG}"
  else
    BUILD_PKG_PATH="${WORKSPACE_ROOT}/${BUILD_PKG}"
  fi
fi

if [[ -n "${AUDIT_PKG:-}" ]]; then
  if [[ "${AUDIT_PKG}" = /* ]]; then
    AUDIT_PKG_PATH="${AUDIT_PKG}"
  else
    AUDIT_PKG_PATH="${WORKSPACE_ROOT}/${AUDIT_PKG}"
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

if [[ -n "${BUILD_PKG_PATH}" && ! -f "${BUILD_PKG_PATH}" ]]; then
  echo "Resolved BUILD_PKG path ${BUILD_PKG_PATH} does not exist" >&2
  exit 1
fi

if [[ -n "${AUDIT_PKG_PATH}" && ! -f "${AUDIT_PKG_PATH}" ]]; then
  echo "Resolved AUDIT_PKG path ${AUDIT_PKG_PATH} does not exist" >&2
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
    echo "Resolved CORE_PKG path ${CORE_PKG_PATH} does not exist" >&2
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
  rm -rf "${WORK_DIR}" 2>/dev/null || true
  if [[ -n "${CLI_PKG_CLEANUP_PATH}" ]]; then
    rm -f "${CLI_PKG_CLEANUP_PATH}" 2>/dev/null || true
  fi
  if [[ -n "${BUILD_PKG_CLEANUP_PATH}" ]]; then
    rm -f "${BUILD_PKG_CLEANUP_PATH}" 2>/dev/null || true
  fi
  if [[ -n "${CORE_PKG_CLEANUP_PATH}" ]]; then
    rm -f "${CORE_PKG_CLEANUP_PATH}" 2>/dev/null || true
  fi
  if [[ -n "${AUDIT_PKG_CLEANUP_PATH}" ]]; then
    rm -f "${AUDIT_PKG_CLEANUP_PATH}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

run_and_capture() {
  local output_file="$1"
  shift
  "$@" | tee "${output_file}"
}

pushd "${WORK_DIR}" >/dev/null

node - <<'NODE' "${WORKSPACE_ROOT}" "${PKG_PATH}" "${CLI_PKG_PATH}" "${BUILD_PKG_PATH}" "${CORE_PKG_PATH}" "${AUDIT_PKG_PATH}"
const fs = require('node:fs');
const path = require('node:path');

const [workspaceRoot, diffPath, cliPath, buildPath, corePath, auditPath] = process.argv.slice(2);

const pkg = {
  name: 'dtifx-diff-cli-smoke',
  version: '0.0.0',
  private: true,
  type: 'module',
};

try {
  const rootPkg = JSON.parse(
    fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'),
  );
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

const cliSpecifier = ensureFileSpecifier(cliPath);
if (cliSpecifier) {
  devDependencies['@dtifx/cli'] = cliSpecifier;
  overrides['@dtifx/cli'] = cliSpecifier;
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

const coreSpecifier = ensureFileSpecifier(corePath);
if (coreSpecifier) {
  devDependencies['@dtifx/core'] = coreSpecifier;
  overrides['@dtifx/core'] = coreSpecifier;
}

const auditSpecifier = ensureFileSpecifier(auditPath);
if (auditSpecifier) {
  devDependencies['@dtifx/audit'] = auditSpecifier;
  overrides['@dtifx/audit'] = auditSpecifier;
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

cp "${FIXTURES_DIR}/"*.json .

pnpm exec dtifx diff --help
run_and_capture version.txt pnpm exec dtifx diff --version
grep -E '^[0-9]+\.' version.txt >/dev/null

readonly DIFF_BASE_FLAGS=(--no-fail-on-breaking --no-fail-on-changes)

run_and_capture cli-output.txt \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json "${DIFF_BASE_FLAGS[@]}"
grep -Fq 'Executive summary' cli-output.txt
grep -Fq '  Impact: 7 breaking · 3 non-breaking' cli-output.txt
grep -Fq '  Changes: 2 added' cli-output.txt
grep -Fq 'Top risks (5)' cli-output.txt
grep -Fq 'Grouped detail' cli-output.txt
grep -Fq 'recommended bump: Major' cli-output.txt
grep -Fq '#/color/brand/alias [breaking]' cli-output.txt
if grep -q $'\e]8;;' cli-output.txt; then
  echo 'cli output should not include OSC-8 hyperlinks by default' >&2
  exit 1
fi

run_and_capture diff.json \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json --format json "${DIFF_BASE_FLAGS[@]}"
grep -Fq '"added": 2' diff.json

run_and_capture diff.md \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json --format markdown "${DIFF_BASE_FLAGS[@]}"
grep -Fq '## Executive summary' diff.md

run_and_capture diff.html \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json --format html "${DIFF_BASE_FLAGS[@]}"
grep -Fq '<!doctype html>' diff.html

run_and_capture diff.yaml \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json --format yaml "${DIFF_BASE_FLAGS[@]}"
grep -Fq 'summary:' diff.yaml

run_and_capture summary.json \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json --summary --format json "${DIFF_BASE_FLAGS[@]}"
grep -Fq '"renamed": 1' summary.json

run_and_capture only-breaking.json \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json --only-breaking --format json "${DIFF_BASE_FLAGS[@]}"
grep -Fq '"nonBreaking": 0' only-breaking.json

run_and_capture filter-type.json \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json --format json --filter-type color "${DIFF_BASE_FLAGS[@]}"
grep -Fq '"type": "color"' filter-type.json
if grep -Fq '"type": "dimension"' filter-type.json; then
  echo 'filter-type should exclude dimension tokens' >&2
  exit 1
fi

run_and_capture filter-path.json \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json --format json --filter-path '#/spacing' "${DIFF_BASE_FLAGS[@]}"
grep -Fq '"#/spacing/scale/150"' filter-path.json

run_and_capture filter-impact.json \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json --format json --filter-impact non-breaking "${DIFF_BASE_FLAGS[@]}"
grep -Fq '"nonBreaking": 3' filter-impact.json
if grep -Fq '"impact": "breaking"' filter-impact.json; then
  echo 'filter-impact non-breaking should exclude breaking changes' >&2
  exit 1
fi

run_and_capture color-output.txt \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json --summary --color "${DIFF_BASE_FLAGS[@]}"
if ! grep -q $'\e' color-output.txt; then
  echo '--color did not enable ANSI colors' >&2
  exit 1
fi

run_and_capture no-color-output.txt \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json --summary --no-color "${DIFF_BASE_FLAGS[@]}"
if grep -q $'\e' no-color-output.txt; then
  echo '--no-color should disable ANSI colors' >&2
  exit 1
fi

run_and_capture stored-output.txt \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json --format json --output stored.json "${DIFF_BASE_FLAGS[@]}"
if [ ! -f stored.json ]; then
  echo '--output did not create the expected file' >&2
  exit 1
fi

run_and_capture quiet.json \
  pnpm exec dtifx diff compare previous.tokens.json next.tokens.json --quiet --format json "${DIFF_BASE_FLAGS[@]}"
if ! node -e "JSON.parse(require('fs').readFileSync('quiet.json', 'utf8'));"; then
  echo '--quiet output should be valid JSON' >&2
  exit 1
fi

popd >/dev/null
