import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { ChokidarWatcher } from '../src/infrastructure/watch/chokidar-watcher.js';
import type { WatchEvent } from '../src/domain/ports/watchers.js';

type ListenerMap = Record<string, ((...args: readonly unknown[]) => void)[]>;

type WatchFn = (paths: string | readonly string[], options?: unknown) => unknown;

type WatchInvocation = Parameters<WatchFn>;

describe('ChokidarWatcher', () => {
  it('maps events, forwards errors, and guards invalid adapters', async () => {
    const listeners: ListenerMap = {};
    const close = vi.fn();
    const invocations: WatchInvocation[] = [];
    let mode: 'valid' | 'invalid' = 'valid';

    const stubWatch: WatchFn = ((...args: Parameters<WatchFn>) => {
      invocations.push(args);

      if (mode === 'invalid') {
        return {} as unknown;
      }

      return {
        on(event: string, listener: (...eventArgs: readonly unknown[]) => void) {
          (listeners[event] ??= []).push(listener);
          return this;
        },
        close,
      } as unknown;
    }) as WatchFn;

    const watcher = new ChokidarWatcher(stubWatch);

    const received: WatchEvent[] = [];
    const errors: unknown[] = [];

    const subscription = await watcher.watch(
      {
        id: 'watch-1',
        paths: ['tokens/**/*.json'],
        options: { cwd: 'repo', ignored: ['**/generated/**'] },
      },
      {
        onEvent: (event) => {
          received.push(event);
        },
        onError: (error) => {
          errors.push(error.error);
        },
      },
    );

    expect(invocations[0]).toEqual([
      ['tokens/**/*.json'],
      { ignoreInitial: true, cwd: 'repo', ignored: ['**/generated/**'] },
    ]);

    const allListener = listeners.all?.[0];
    expect(allListener).toBeTypeOf('function');

    const createdPath = path.join('repo', 'tokens', 'new.json');
    const updatedPath = path.join('repo', 'tokens', 'changed.json');
    const deletedPath = path.join('repo', 'tokens', 'removed.json');

    allListener?.('add', createdPath);
    allListener?.('change', updatedPath);
    allListener?.('unlink', deletedPath);
    allListener?.('ready', path.join('repo', 'tokens', 'ignored.json'));
    allListener?.(Symbol('bad'), 42);

    const errorListener = listeners.error?.[0];
    expect(errorListener).toBeTypeOf('function');
    const boom = new Error('boom');
    errorListener?.(boom);

    expect(received).toEqual([
      { requestId: 'watch-1', type: 'created', path: createdPath },
      { requestId: 'watch-1', type: 'updated', path: updatedPath },
      { requestId: 'watch-1', type: 'deleted', path: deletedPath },
    ]);
    expect(errors).toEqual([boom]);

    await subscription.close();
    expect(close).toHaveBeenCalledTimes(1);

    mode = 'invalid';

    expect(() => {
      watcher.watch(
        {
          id: 'watch-2',
          paths: ['tokens/**/*.json'],
        },
        {
          onEvent: () => {
            // noop
          },
        },
      );
    }).toThrow(/FSWatcher/);

    expect(invocations[1]).toEqual([['tokens/**/*.json'], { ignoreInitial: true }]);
  });
});
