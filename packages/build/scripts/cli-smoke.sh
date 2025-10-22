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
DIFF_PKG_PATH=""
DIFF_PKG_CLEANUP_PATH=""
AUDIT_PKG_PATH=""
AUDIT_PKG_CLEANUP_PATH=""
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

else
  if [[ "${CLI_PKG}" = /* ]]; then
    CLI_PKG_PATH="${CLI_PKG}"
  else
    CLI_PKG_PATH="${WORKSPACE_ROOT}/${CLI_PKG}"
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

if [[ -z "${AUDIT_PKG:-}" ]]; then
  AUDIT_PACKAGE_ROOT="${WORKSPACE_ROOT}/packages/audit"
  if [[ -d "${AUDIT_PACKAGE_ROOT}" ]]; then
    if ! declare -f pack_workspace_package >/dev/null; then
      # shellcheck source=../../../scripts/lib/package-utils.sh
      source "${WORKSPACE_ROOT}/scripts/lib/package-utils.sh"
    fi
    AUDIT_PKG_PATH="$(pack_workspace_package "${AUDIT_PACKAGE_ROOT}")"
    AUDIT_PKG="${AUDIT_PKG_PATH}"
    AUDIT_PKG_CLEANUP_PATH="${AUDIT_PKG_PATH}"
  fi
fi

if [[ -z "${EXTRACTORS_PKG:-}" ]]; then
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
else
  if [[ "${EXTRACTORS_PKG}" = /* ]]; then
    EXTRACTORS_PKG_PATH="${EXTRACTORS_PKG}"
  else
    EXTRACTORS_PKG_PATH="${WORKSPACE_ROOT}/${EXTRACTORS_PKG}"
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

if [[ -n "${DIFF_PKG_PATH}" && ! -f "${DIFF_PKG_PATH}" ]]; then
  echo "Resolved DIFF_PKG path ${DIFF_PKG_PATH} does not exist" >&2
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

if [[ -n "${AUDIT_PKG:-}" ]]; then
  if [[ "${AUDIT_PKG}" = /* ]]; then
    AUDIT_PKG_PATH="${AUDIT_PKG}"
  else
    AUDIT_PKG_PATH="${WORKSPACE_ROOT}/${AUDIT_PKG}"
  fi
  if [[ ! -f "${AUDIT_PKG_PATH}" ]]; then
    echo "AUDIT_PKG path ${AUDIT_PKG_PATH} does not exist" >&2
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
  if [[ -n "${DIFF_PKG_CLEANUP_PATH}" ]]; then
    rm -f "${DIFF_PKG_CLEANUP_PATH}" 2>/dev/null || true
  fi
  if [[ -n "${AUDIT_PKG_CLEANUP_PATH}" ]]; then
    rm -f "${AUDIT_PKG_CLEANUP_PATH}" 2>/dev/null || true
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

assert_file_contains() {
  local file="$1"
  local expected="$2"
  if [[ ! -f "$file" ]]; then
    echo "Expected artifact $file to exist" >&2
    exit 1
  fi
  if ! grep -Fq -- "$expected" "$file"; then
    echo "Expected '$expected' in $file" >&2
    exit 1
  fi
}

resolve_artifact_path() {
  local relative_path="$1"
  shift || true
  local search_roots=()
  if [[ "$#" -eq 0 ]]; then
    search_roots=(".")
  else
    search_roots=("$@")
  fi

  for root in "${search_roots[@]}"; do
    local candidate
    if [[ -z "$root" || "$root" == "." ]]; then
      candidate="$relative_path"
    else
      candidate="${root%/}/$relative_path"
    fi
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

resolve_artifact_or_fail() {
  local relative_path="$1"
  shift || true
  local resolved
  if resolved=$(resolve_artifact_path "$relative_path" "$@"); then
    printf '%s\n' "$resolved"
    return 0
  fi

  local search_roots=()
  if [[ "$#" -eq 0 ]]; then
    search_roots=(".")
  else
    search_roots=("$@")
  fi

  local formatted=""
  for root in "${search_roots[@]}"; do
    local display_root="$root"
    if [[ -z "$display_root" ]]; then
      display_root='.'
    fi
    if [[ -n "$formatted" ]]; then
      formatted+=", "
    fi
    formatted+="$display_root"
  done

  echo "Expected artifact ${relative_path} to exist under: ${formatted}" >&2
  exit 1
}

print_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Expected artifact $file to exist" >&2
    exit 1
  fi
  echo "--- Contents of ${file} ---"
  cat "$file"
  echo "--- End of ${file} ---"
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
  jsonLines.push(line);
}

const payload = jsonLines.join('\n');
const parsed = JSON.parse(payload);
process.stdout.write(JSON.stringify(parsed));
NODE
}

pushd "${WORK_DIR}" >/dev/null

node - <<'NODE' "${WORKSPACE_ROOT}" "${PKG_PATH}" "${CLI_PKG_PATH}" "${CORE_PKG_PATH}" "${AUDIT_PKG_PATH}" "${DIFF_PKG_PATH}" "${EXTRACTORS_PKG_PATH}"
const fs = require('node:fs');
const path = require('node:path');

const [workspaceRoot, buildPath, cliPath, corePath, auditPath, diffPath, extractorsPath] = process.argv.slice(2);
const pkg = {
  name: 'dtifx-build-cli-smoke',
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

const buildSpecifier = ensureFileSpecifier(buildPath);
if (buildSpecifier) {
  devDependencies['@dtifx/build'] = buildSpecifier;
  overrides['@dtifx/build'] = buildSpecifier;
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

const auditSpecifier = ensureFileSpecifier(auditPath);
if (auditSpecifier) {
  devDependencies['@dtifx/audit'] = auditSpecifier;
  overrides['@dtifx/audit'] = auditSpecifier;
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

run_and_capture help.txt pnpm exec dtifx build --help
assert_contains help.txt 'Usage: dtifx build'

run_and_capture validate-human.txt \
  pnpm exec dtifx build validate --config dtifx.config.json
assert_contains validate-human.txt 'Planned 2 DTIF sources successfully.'

run_and_capture validate-json.txt \
  pnpm exec dtifx build validate --config dtifx.config.json --reporter json --json-logs
assert_contains validate-json.txt '"event":"validate.completed"'

rm -rf dist-human dist
run_and_capture generate-human.txt \
  pnpm exec dtifx build generate --config dtifx.config.json --out-dir dist-human
assert_contains generate-human.txt 'Generated 12 artifacts for 8 tokens'
assert_contains generate-human.txt 'dist/css/tokens.css'
assert_contains generate-human.txt 'dist/sass/tokens.scss'
assert_contains generate-human.txt 'dist/less/tokens.less'
assert_contains generate-human.txt 'dist/modules/tokens.d.ts'
assert_contains generate-human.txt 'dist/modules/tokens.js'
assert_contains generate-human.txt 'dist/modules/tokens.ts'
assert_contains generate-human.txt 'dist/ios/ColorTokens.swift'
assert_contains generate-human.txt 'dist/android/values/colors.xml'
assert_contains generate-human.txt 'dist/android/compose/src/main/java/com/example/tokens/ComposeColorTokens.kt'
assert_contains generate-human.txt 'dist/android/compose/src/main/java/com/example/tokens/ComposeTypographyTokens.kt'
assert_contains generate-human.txt 'dist/android/compose/src/main/java/com/example/tokens/ComposeShapeTokens.kt'
assert_contains generate-human.txt 'dist/json/tokens.json'

css_artifact_path=$(resolve_artifact_or_fail 'dist/css/tokens.css' 'dist-human' '.')
print_file "$css_artifact_path"
assert_file_contains "$css_artifact_path" '--tokens-foundation-color-brand: oklch('
assert_file_contains "$css_artifact_path" '--tokens-product-color-cta: oklch('

sass_artifact_path=$(resolve_artifact_or_fail 'dist/sass/tokens.scss' 'dist-human' '.')
print_file "$sass_artifact_path"
assert_file_contains "$sass_artifact_path" '$tokens-foundation-color-brand: oklch('
assert_file_contains "$sass_artifact_path" '$tokens-product-color-cta: oklch('

less_artifact_path=$(resolve_artifact_or_fail 'dist/less/tokens.less' 'dist-human' '.')
print_file "$less_artifact_path"
assert_file_contains "$less_artifact_path" '@tokens-foundation-color-brand: oklch('
assert_file_contains "$less_artifact_path" '@tokens-product-color-cta: oklch('

swift_artifact_path=$(resolve_artifact_or_fail 'dist/ios/ColorTokens.swift' 'dist-human' '.')
print_file "$swift_artifact_path"
assert_file_contains "$swift_artifact_path" 'struct ColorTokens'
assert_file_contains "$swift_artifact_path" 'public static let tokensProductColorCta'

android_artifact_path=$(resolve_artifact_or_fail 'dist/android/values/colors.xml' 'dist-human' '.')
print_file "$android_artifact_path"
assert_file_contains "$android_artifact_path" '<color name="tokens_foundation_color_brand">'
assert_file_contains "$android_artifact_path" '<color name="tokens_product_color_cta">'

json_artifact_path=$(resolve_artifact_or_fail 'dist/json/tokens.json' 'dist-human' '.')
print_file "$json_artifact_path"
assert_file_contains "$json_artifact_path" '"colorBrand"'
assert_file_contains "$json_artifact_path" '"colorCta"'

javascript_dts_path=$(resolve_artifact_or_fail 'dist/modules/tokens.d.ts' 'dist-human' '.')
print_file "$javascript_dts_path"
assert_file_contains "$javascript_dts_path" 'export declare const moduleTokens'

javascript_module_path=$(resolve_artifact_or_fail 'dist/modules/tokens.js' 'dist-human' '.')
print_file "$javascript_module_path"
assert_file_contains "$javascript_module_path" 'export const moduleTokens'

typescript_module_path=$(resolve_artifact_or_fail 'dist/modules/tokens.ts' 'dist-human' '.')
print_file "$typescript_module_path"
assert_file_contains "$typescript_module_path" 'export const moduleTokens'

compose_colors_path=$(resolve_artifact_or_fail 'dist/android/compose/src/main/java/com/example/tokens/ComposeColorTokens.kt' 'dist-human' '.')
print_file "$compose_colors_path"
assert_file_contains "$compose_colors_path" 'object ComposeColorTokens'
assert_file_contains "$compose_colors_path" 'Color('

compose_typography_path=$(resolve_artifact_or_fail 'dist/android/compose/src/main/java/com/example/tokens/ComposeTypographyTokens.kt' 'dist-human' '.')
print_file "$compose_typography_path"
assert_file_contains "$compose_typography_path" 'object ComposeTypographyTokens'
assert_file_contains "$compose_typography_path" 'TextStyle('

compose_shapes_path=$(resolve_artifact_or_fail 'dist/android/compose/src/main/java/com/example/tokens/ComposeShapeTokens.kt' 'dist-human' '.')
print_file "$compose_shapes_path"
assert_file_contains "$compose_shapes_path" 'object ComposeShapeTokens'
assert_file_contains "$compose_shapes_path" 'RoundedCornerShape'
rm -rf dist-human dist

rm -rf dist-json dist
run_and_capture generate-json.txt \
  pnpm exec dtifx build generate --config dtifx.config.json --out-dir dist-json --reporter json
assert_contains generate-json.txt '"event":"build.completed"'
assert_contains generate-json.txt '"artifactCount":12'
assert_contains generate-json.txt '"name":"css.variables"'
assert_contains generate-json.txt '"name":"sass.variables"'
assert_contains generate-json.txt '"name":"less.variables"'
assert_contains generate-json.txt '"name":"javascript.module"'
assert_contains generate-json.txt '"name":"typescript.module"'
assert_contains generate-json.txt '"name":"ios.swiftui.colors"'
assert_contains generate-json.txt '"name":"android.material.colors"'
assert_contains generate-json.txt '"name":"android.compose.colors"'
assert_contains generate-json.txt '"name":"android.compose.typography"'
assert_contains generate-json.txt '"name":"android.compose.shapes"'
assert_contains generate-json.txt '"name":"json.snapshot"'
rm -rf dist-json dist

run_and_capture generate-html.txt \
  pnpm exec dtifx build generate --config dtifx.config.json --reporter html --timings
assert_contains generate-html.txt '<div class="build-success">'
assert_contains generate-html.txt 'Generated <strong>12</strong> artifacts for <strong>8</strong> tokens'

rm -rf dist-telemetry dist
run_and_capture telemetry-stdout.txt \
  pnpm exec dtifx build generate \
    --config dtifx.config.json \
    --reporter json \
    --telemetry stdout \
    --json-logs \
    --out-dir dist-telemetry
assert_contains telemetry-stdout.txt '"event":"build.completed"'
assert_contains telemetry-stdout.txt '"name":"dtifx.cli.generate"'
assert_contains telemetry-stdout.txt '"name":"dtifx.pipeline.run"'
rm -rf dist-telemetry dist


run_and_capture inspect-human.txt \
  pnpm exec dtifx build inspect --config dtifx.config.json --pointer '#/tokens/product'
assert_contains inspect-human.txt '#/tokens/product/colorCta (color)'
assert_contains inspect-human.txt 'dimension.toRem'

run_and_capture inspect-json.txt \
  pnpm exec dtifx build inspect \
    --config dtifx.config.json \
    --json \
    --type color \
    --json-logs
inspect_payload=$(parse_json_from_file inspect-json.txt)
if ! echo "$inspect_payload" | grep -F '"pointer":"#/tokens/product/colorCtaText"' >/dev/null; then
  echo 'inspect JSON output missing expected pointer' >&2
  exit 1
fi

popd >/dev/null
