import type { SignalingSocket } from './socket';

type Handler = (...args: any[]) => void;

export class DeferredSocket implements SignalingSocket {
  private transport: SignalingSocket | null = null;
  private listeners = new Map<string, Set<Handler>>();
  private pending: Array<{ event: string; args: any[] }> = [];
  private failure: Error | null = null;
  private endpoint: string | null = null;

  constructor(load: () => Promise<() => SignalingSocket>) {
    void Promise.resolve().then(load).then(create => {
      const socket = create();
      this.transport = socket;
      for (const [event, listeners] of this.listeners) {
        for (const listener of listeners) socket.on(event, listener);
      }
      if (this.endpoint) socket.retarget?.(this.endpoint);
      for (const { event, args } of this.pending) socket.emit(event, ...args);
      this.pending = [];
    }).catch(cause => {
      this.failure = cause instanceof Error ? cause : new Error(String(cause));
      for (const listener of [...this.listeners.get('connect_error') ?? []]) listener(this.failure);
      for (const { args } of this.pending) this.failAck(args);
      this.pending = [];
    });
  }

  get connected(): boolean { return this.transport?.connected ?? false; }

  on(event: string, listener: Handler): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    this.transport?.on(event, listener);
    if (this.failure && event === 'connect_error') {
      queueMicrotask(() => {
        if (this.listeners.get(event)?.has(listener)) listener(this.failure);
      });
    }
    return this;
  }

  once(event: string, listener: Handler): this {
    const wrapped: Handler = (...args) => { this.off(event, wrapped); listener(...args); };
    return this.on(event, wrapped);
  }

  off(event: string, listener?: Handler): this {
    if (listener) this.listeners.get(event)?.delete(listener);
    else this.listeners.delete(event);
    this.transport?.off(event, listener);
    return this;
  }

  emit(event: string, ...args: any[]): this {
    if (this.transport) this.transport.emit(event, ...args);
    else if (this.failure) this.failAck(args);
    else this.pending.push({ event, args });
    return this;
  }

  retarget(endpoint: string): void {
    this.endpoint = endpoint;
    this.transport?.retarget?.(endpoint);
  }

  private failAck(args: any[]): void {
    const callback = args.at(-1);
    if (typeof callback === 'function') callback({ success: false, error: 'CONNECT_ERROR' });
  }
}
