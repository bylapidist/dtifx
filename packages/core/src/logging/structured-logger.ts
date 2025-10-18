export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogEvent {
  readonly level: LogLevel;
  readonly name: string;
  readonly event: string;
  readonly elapsedMs?: number;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface StructuredLogger {
  log(entry: StructuredLogEvent): void;
}

export class JsonLineLogger implements StructuredLogger {
  constructor(private readonly output: { write(line: string): void }) {}

  log(entry: StructuredLogEvent): void {
    const payload = JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    this.output.write(`${payload}\n`);
  }
}

export const noopLogger: StructuredLogger = {
  log() {
    // noop
  },
};
