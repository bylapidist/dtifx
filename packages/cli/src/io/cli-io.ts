export interface CliIo {
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;

  writeOut(chunk: string): void;
  writeErr(chunk: string): void;
  exit(code: number): never;
}
