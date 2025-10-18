export type WatchEventType = 'created' | 'updated' | 'deleted';

export interface WatchEvent {
  readonly requestId: string;
  readonly type: WatchEventType;
  readonly path: string;
}

export interface WatchError {
  readonly requestId: string;
  readonly error: unknown;
}

export interface WatchOptions {
  readonly cwd?: string;
  readonly ignored?: string | readonly string[];
}

export interface WatchRequest {
  readonly id: string;
  readonly paths: string | readonly string[];
  readonly options?: WatchOptions;
}

export interface WatchCallbacks {
  onEvent(event: WatchEvent): void;
  onError?(issue: WatchError): void;
}

export interface WatchSubscription {
  close(): Promise<void> | void;
}

export interface WatcherPort {
  watch(
    request: WatchRequest,
    callbacks: WatchCallbacks,
  ): Promise<WatchSubscription> | WatchSubscription;
}
