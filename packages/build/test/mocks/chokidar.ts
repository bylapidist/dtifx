/**
 * Minimal watcher implementation used to satisfy chokidar interactions in tests.
 */
class MockFsWatcher {
  /**
   * No-op listener registration that preserves fluent chaining in the adapter.
   * @returns {MockFsWatcher} The current watcher instance for chaining.
   */
  on(): this {
    return this;
  }

  async close(): Promise<void> {}
}

/**
 * Produces a mock chokidar watcher for Vitest environments.
 * @returns {MockFsWatcher} A watcher stub that exposes the minimal API surface.
 */
export function watch(): MockFsWatcher {
  return new MockFsWatcher();
}
