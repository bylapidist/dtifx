declare module 'chokidar' {
  export interface WatchOptions {
    readonly ignoreInitial?: boolean;
    readonly cwd?: string;
    readonly ignored?: string | RegExp | readonly (string | RegExp)[];
    readonly [key: string]: unknown;
  }

  export interface FsWatcher {
    on(event: string, listener: (...args: readonly unknown[]) => void): FsWatcher;
    close(): void | Promise<void>;
  }

  export function watch(paths: string | readonly string[], options?: WatchOptions): FsWatcher;
}
