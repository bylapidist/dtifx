#!/usr/bin/env bash

pack_workspace_package() {
  local package_dir="$1"

  if [[ ! -d "${package_dir}" ]]; then
    echo "Package directory ${package_dir} does not exist" >&2
    return 1
  fi

  pushd "${package_dir}" >/dev/null || return 1

  local package_name
  if ! package_name="$(node <<'NODE'
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const raw = readFileSync(resolve('package.json'), 'utf8');
const pkg = JSON.parse(raw);

if (!pkg.name || typeof pkg.name !== 'string') {
  console.error('Package manifest is missing a "name" field');
  process.exit(1);
}

process.stdout.write(pkg.name);
NODE
)"; then
    popd >/dev/null || true
    return 1
  fi

  local pack_result_file
  pack_result_file="$(mktemp)"

  local attempt=0
  local filename=""

  while [[ ${attempt} -lt 2 ]]; do
    if ! pnpm pack --json >"${pack_result_file}"; then
      if [[ ${attempt} -eq 0 ]]; then
        echo "Installing workspace dependencies for ${package_name} before packing" >&2
        pnpm install --filter "${package_name}..." --prefer-offline >/dev/null
        attempt=$((attempt + 1))
        continue
      fi

      rm -f "${pack_result_file}"
      popd >/dev/null || true
      echo "pnpm pack failed for ${package_name}" >&2
      return 1
    fi

    filename="$(node - "${pack_result_file}" <<'NODE'
const { readFileSync } = require('node:fs');

const path = process.argv[2];
const raw = readFileSync(path, 'utf8').trim();

if (!raw) {
  console.error('pnpm pack did not return any JSON payload');
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to parse pnpm pack JSON output: ${message}`);
  process.exit(1);
}

const entry = Array.isArray(parsed) ? parsed[0] : parsed;
if (entry && typeof entry === 'object' && entry.error) {
  const { code, message } = entry.error;
  console.error(`pnpm pack failed: ${message ?? 'Unknown error'}`);
  if (code === 'ERR_PNPM_CANNOT_RESOLVE_WORKSPACE_PROTOCOL') {
    process.exit(11);
  }
  process.exit(10);
}

if (!entry || typeof entry.filename !== 'string' || entry.filename.length === 0) {
  console.error('pnpm pack JSON output missing filename');
  process.exit(1);
}

process.stdout.write(entry.filename);
NODE
    )"
    local status=$?
    if [[ ${status} -ne 0 ]]; then
      if [[ ${status} -eq 11 && ${attempt} -eq 0 ]]; then
        echo "Installing workspace dependencies for ${package_name} before packing" >&2
        pnpm install --filter "${package_name}..." --prefer-offline >/dev/null
        attempt=$((attempt + 1))
        continue
      fi

      rm -f "${pack_result_file}" 
      popd >/dev/null || true
      return ${status}
    fi

    break
  done

  rm -f "${pack_result_file}"
  popd >/dev/null || return 1

  printf '%s/%s' "${package_dir}" "${filename}"
}
