#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_ROOT="${REPO_ROOT}/packages/dscp"

if [[ ! -d "${PACKAGE_ROOT}" ]]; then
  echo "@dtifx/dscp package directory not found" >&2
  exit 1
fi

echo "Building @dtifx/core, @dtifx/cli, @dtifx/dscp packages for smoke test" >&2
pnpm exec nx run-many -t build --projects core,cli,dscp --output-style=static

# shellcheck source=./lib/package-utils.sh
source "${REPO_ROOT}/scripts/lib/package-utils.sh"

PKG_PATH="$(pack_workspace_package "${PACKAGE_ROOT}")"
PKG_NAME="$(basename "${PKG_PATH}")"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

cd "${WORK_DIR}"
npm init -y >/dev/null
npm install --save-dev "${PKG_PATH}" >/dev/null 2>&1

# Create a minimal tokens/build/tokens.json to simulate dtifx build output
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

# Run dtifx dscp generate
node_modules/.bin/dtifx dscp generate --from tokens/build/ --out DESIGN_SYSTEM.md

if [[ ! -f DESIGN_SYSTEM.md ]]; then
  echo "ERROR: DESIGN_SYSTEM.md was not generated" >&2
  exit 1
fi

if ! grep -q '^\$schema' DESIGN_SYSTEM.md && ! grep -q 'schema' DESIGN_SYSTEM.md; then
  echo "ERROR: DESIGN_SYSTEM.md appears malformed (no schema reference)" >&2
  exit 1
fi

echo "smoke:dscp passed — DESIGN_SYSTEM.md generated ($(wc -c < DESIGN_SYSTEM.md) bytes)" >&2
