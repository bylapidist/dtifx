#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_ROOT="${REPO_ROOT}/packages/audit"

if [[ ! -d "${PACKAGE_ROOT}" ]]; then
  echo "@dtifx/audit package directory not found" >&2
  exit 1
fi

echo "Building @dtifx/core, @dtifx/cli, and @dtifx/audit packages for smoke test" >&2
pnpm exec nx run-many -t build --projects core,cli,audit --output-style=static

# shellcheck source=./lib/package-utils.sh
source "${REPO_ROOT}/scripts/lib/package-utils.sh"

PKG_PATH="$(pack_workspace_package "${PACKAGE_ROOT}")"
PKG_NAME="$(basename "${PKG_PATH}")"

CLI_PACKAGE_ROOT="${REPO_ROOT}/packages/cli"
CLI_PKG_PATH="$(pack_workspace_package "${CLI_PACKAGE_ROOT}")"

CORE_PACKAGE_ROOT="${REPO_ROOT}/packages/core"
CORE_PKG_PATH=""
if [[ -d "${CORE_PACKAGE_ROOT}" ]]; then
  CORE_PKG_PATH="$(pack_workspace_package "${CORE_PACKAGE_ROOT}")"
fi

cleanup_artifacts() {
  rm -f "${PKG_PATH}" 2>/dev/null || true
  if [[ -n "${CORE_PKG_PATH:-}" ]]; then
    rm -f "${CORE_PKG_PATH}" 2>/dev/null || true
  fi
  rm -f "${CLI_PKG_PATH}" 2>/dev/null || true
}
trap cleanup_artifacts EXIT

echo "Running dtifx audit smoke test with package artifact ${PKG_NAME}" >&2
if [[ -n "${CORE_PKG_PATH}" ]]; then
  echo "Using local @dtifx/core artifact $(basename "${CORE_PKG_PATH}")" >&2
fi
echo "Using local @dtifx/cli artifact $(basename "${CLI_PKG_PATH}")" >&2

PKG="${PKG_PATH}" CORE_PKG="${CORE_PKG_PATH}" CLI_PKG="${CLI_PKG_PATH}" bash "${PACKAGE_ROOT}/scripts/cli-smoke.sh"
