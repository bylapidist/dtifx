import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ArtifactWriterPort, FormatterExecution } from '../../domain/ports/formatters.js';

export interface FileSystemArtifactWriterOptions {
  readonly configDir: string;
  readonly defaultOutDir?: string;
}

export class FileSystemArtifactWriter implements ArtifactWriterPort {
  private readonly configDir: string;
  private readonly defaultOutDir: string;

  constructor(options: FileSystemArtifactWriterOptions) {
    this.configDir = options.configDir;
    this.defaultOutDir = options.defaultOutDir ?? 'dist';
  }

  async write(
    executions: readonly FormatterExecution[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    const written = new Map<string, string[]>();
    for (const execution of executions) {
      if (execution.artifacts.length === 0) {
        continue;
      }
      const directory = this.resolveOutputDirectory(execution);
      const outputPaths = await Promise.all(
        execution.artifacts.map(async (artifact) => {
          const outputPath = path.resolve(directory, artifact.path);
          await mkdir(path.dirname(outputPath), { recursive: true });
          if (artifact.encoding === 'utf8') {
            await writeFile(outputPath, String(artifact.contents), 'utf8');
          } else {
            const buffer =
              artifact.contents instanceof Uint8Array
                ? artifact.contents
                : Buffer.from(artifact.contents);
            await writeFile(outputPath, buffer);
          }
          return outputPath;
        }),
      );
      written.set(execution.id, outputPaths);
    }
    return written;
  }

  private resolveOutputDirectory(execution: FormatterExecution): string {
    const directory = execution.output.directory;
    if (directory && directory.length > 0) {
      return path.resolve(this.configDir, directory);
    }
    return path.resolve(this.configDir, this.defaultOutDir);
  }
}
