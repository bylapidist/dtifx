import { watch } from 'chokidar';

import type {
  WatchCallbacks,
  WatchEventType,
  WatchRequest,
  WatchSubscription,
  WatcherPort,
} from '../../domain/ports/watchers.js';

const EVENT_MAP: Record<string, WatchEventType | undefined> = {
  add: 'created',
  addDir: 'created',
  change: 'updated',
  unlink: 'deleted',
  unlinkDir: 'deleted',
};

/**
 * Adapts the chokidar file system watcher to the build pipeline watcher port.
 */
export class ChokidarWatcher implements WatcherPort {
  constructor(private readonly chokidarWatch: typeof watch = watch) {}

  /**
   * Starts watching the requested file system paths using chokidar and forwards events to the provided callbacks.
   * @param {WatchRequest} request - The watch registration issued by the build runtime.
   * @param {WatchCallbacks} callbacks - Callbacks that receive filesystem events and errors.
   * @returns {WatchSubscription} A subscription that can be used to tear down the watcher.
   */
  watch(request: WatchRequest, callbacks: WatchCallbacks): WatchSubscription {
    const ignored = request.options?.ignored;
    const options: Parameters<typeof watch>[1] = {
      ignoreInitial: true,
      ...(request.options?.cwd ? { cwd: request.options.cwd } : {}),
      ...(ignored
        ? {
            ignored: Array.isArray(ignored)
              ? ([...ignored] as (string | RegExp)[])
              : (ignored as string | RegExp),
          }
        : {}),
    } satisfies Parameters<typeof watch>[1];

    const paths = Array.isArray(request.paths)
      ? ([...request.paths] as string[])
      : (request.paths as string);
    const candidate: unknown = this.chokidarWatch(paths, options);
    if (!isFsWatcher(candidate)) {
      throw new TypeError('Expected chokidar watch to return an FSWatcher');
    }
    const watcher: FsWatcher = candidate;

    watcher.on('all', (...args: readonly unknown[]) => {
      const [event, changedPath] = args;
      if (typeof event !== 'string' || typeof changedPath !== 'string') {
        return;
      }
      const type = EVENT_MAP[event];
      if (!type) {
        return;
      }
      callbacks.onEvent({
        requestId: request.id,
        type,
        path: changedPath,
      });
    });

    watcher.on('error', (error: unknown) => {
      if (callbacks.onError) {
        callbacks.onError({ requestId: request.id, error });
      }
    });

    return {
      close: () => watcher.close(),
    } satisfies WatchSubscription;
  }
}

/**
 * Determines whether a value satisfies the subset of chokidar's FSWatcher API that is required by the adapter.
 * @param {unknown} value - The value returned by chokidar.
 * @returns {value is FsWatcher} `true` when the value exposes the expected watcher interface.
 */
function isFsWatcher(value: unknown): value is FsWatcher {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record['on'] === 'function' && typeof record['close'] === 'function';
}

interface FsWatcher {
  on(event: string, listener: (...args: readonly unknown[]) => void): FsWatcher;
  close(): Promise<void> | void;
}
