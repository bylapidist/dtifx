#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  auditCommandModule,
  buildCommandModule,
  createCliKernel,
  createProcessCliIo,
  diffCommandModule,
  initCommandModule,
} from './index.js';

const require = createRequire(import.meta.url);

interface PackageManifest {
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
}

const loadPackageManifest = (): PackageManifest => {
  const manifestName = '@dtifx/cli';
  let directory = path.dirname(fileURLToPath(import.meta.url));

  while (true) {
    const manifestPath = path.join(directory, 'package.json');

    try {
      const manifest = require(manifestPath) as PackageManifest;
      if (manifest.name === manifestName) {
        return manifest;
      }
    } catch {
      // Continue searching up the directory tree when the manifest is missing.
    }

    const parentDirectory = path.dirname(directory);
    if (parentDirectory === directory) {
      return {};
    }

    directory = parentDirectory;
  }
};

const packageManifest = loadPackageManifest();

const io = createProcessCliIo({ process });

const kernel = createCliKernel({
  programName: 'dtifx',
  version: packageManifest.version ?? '0.0.0',
  description: packageManifest.description ?? '',
  io,
});

kernel.register(diffCommandModule);
kernel.register(buildCommandModule);
kernel.register(auditCommandModule);
kernel.register(initCommandModule);

const exitCode = await kernel.run();

if (process.argv.length <= 2) {
  const name = packageManifest.name ?? '@dtifx/cli';
  const message =
    `${name} supports init, diff, build, and audit workflows. ` +
    'Explore `dtifx init --help`, `dtifx diff --help`, `dtifx build --help`, or `dtifx audit --help` to get started.\n';
  io.writeOut(message);
}

io.exit(exitCode);
