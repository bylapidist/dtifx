#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_ROOT="${REPO_ROOT}/packages/dscp"

if [[ ! -d "${PACKAGE_ROOT}" ]]; then
  echo "@dtifx/dscp package directory not found" >&2
  exit 1
fi

echo "Building @dtifx/core, @dtifx/cli, @dtifx/dscp, @dtifx/extractors packages for smoke test" >&2
pnpm exec nx run-many -t build --projects core,cli,dscp,extractors --output-style=static >&2

# shellcheck source=./lib/package-utils.sh
source "${REPO_ROOT}/scripts/lib/package-utils.sh"

DSCP_PKG_PATH="$(pack_workspace_package "${PACKAGE_ROOT}")"
CLI_PKG_PATH="$(pack_workspace_package "${REPO_ROOT}/packages/cli")"
CORE_PKG_PATH="$(pack_workspace_package "${REPO_ROOT}/packages/core")"
EXTRACTORS_PKG_PATH="$(pack_workspace_package "${REPO_ROOT}/packages/extractors")"

WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -f "${DSCP_PKG_PATH}" "${CLI_PKG_PATH}" "${CORE_PKG_PATH}" "${EXTRACTORS_PKG_PATH}" 2>/dev/null || true
  rm -rf "${WORK_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

pushd "${WORK_DIR}" >/dev/null

printf 'auto-install-peers=false\n' > .npmrc

node - <<'NODE' "${REPO_ROOT}" "${DSCP_PKG_PATH}" "${CLI_PKG_PATH}" "${CORE_PKG_PATH}" "${EXTRACTORS_PKG_PATH}"
const fs = require('node:fs');
const path = require('node:path');

const [workspaceRoot, dscpPath, cliPath, corePath, extractorsPath] = process.argv.slice(2);

const pkg = {
  name: 'dtifx-dscp-smoke',
  version: '0.0.0',
  private: true,
  type: 'module',
};

try {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'));
  if (typeof rootPkg.packageManager === 'string' && rootPkg.packageManager.length > 0) {
    pkg.packageManager = rootPkg.packageManager;
  }
} catch (error) {
  if ((error && typeof error === 'object' && 'code' in error ? error.code : undefined) !== 'ENOENT') {
    throw error;
  }
}

const ensureFileSpecifier = (p) => (p ? (p.startsWith('file:') ? p : `file:${p}`) : undefined);

const devDependencies = {};
const overrides = {};

const register = (name, specifier) => {
  if (!specifier) return;
  devDependencies[name] = specifier;
  overrides[name] = specifier;
};

register('@dtifx/dscp', ensureFileSpecifier(dscpPath));
register('@dtifx/cli', ensureFileSpecifier(cliPath));
register('@dtifx/core', ensureFileSpecifier(corePath));
register('@dtifx/extractors', ensureFileSpecifier(extractorsPath));

pkg.devDependencies = devDependencies;
pkg.pnpm = { overrides };

fs.writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
NODE

pnpm install \
  --ignore-workspace \
  --shared-workspace-lockfile=false \
  --link-workspace-packages=false \
  --no-frozen-lockfile \
  --ignore-scripts \
  >/dev/null

mkdir -p tokens/build
cat > tokens/build/tokens.json << 'EOF'
{
  "$version": "1.0.0",
  "color": {
    "primary": {
      "$type": "color",
      "$value": { "colorSpace": "srgb", "components": [0.067, 0.047, 0.996] }
    }
  }
}
EOF

pnpm exec dtifx dscp generate --from tokens/build/ --out DESIGN_SYSTEM.md

if [[ ! -f DESIGN_SYSTEM.md ]]; then
  echo "ERROR: DESIGN_SYSTEM.md was not generated" >&2
  exit 1
fi

if ! grep -q '# DESIGN_SYSTEM.md' DESIGN_SYSTEM.md; then
  echo "ERROR: DESIGN_SYSTEM.md appears malformed (missing heading)" >&2
  exit 1
fi

echo "smoke:dscp passed — DESIGN_SYSTEM.md generated ($(wc -c < DESIGN_SYSTEM.md) bytes)" >&2

popd >/dev/null
