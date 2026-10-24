/**
 * Serialized save queue: at most one request in flight per key.
 * While one is in flight, coalesce the latest pending patch for that key.
 * Ensures the last user choice is always the last write to the server.
 */

export type SaveRequest<T> = () => Promise<T>;

export type SupersededResult = { superseded: true };

type QueuedItem<T> = {
  request: SaveRequest<T>;
  resolve: (value: T | SupersededResult) => void;
  reject: (error: unknown) => void;
};

export type SaveQueueStatus = 
  | { state: "idle" }
  | { state: "saving"; key: string }
  | { state: "has-queued"; keys: string[] };

type StatusListener = (status: SaveQueueStatus) => void;

export function createSaveQueue<T>() {
  /** In-flight request per key */
  const inFlight = new Map<string, Promise<T>>();
  /** Latest queued request per key (coalesced) */
  const queued = new Map<string, QueuedItem<T>>();
  /** Last failed request per key (for retry) */
  const lastFailed = new Map<string, SaveRequest<T>>();
  /** Status listeners */
  const listeners = new Set<StatusListener>();

  function getStatus(): SaveQueueStatus {
    if (inFlight.size === 0 && queued.size === 0) {
      return { state: "idle" };
    }
    if (inFlight.size > 0 && queued.size === 0) {
      return { state: "saving", key: Array.from(inFlight.keys())[0] };
    }
    return { state: "has-queued", keys: Array.from(queued.keys()) };
  }

  function notifyListeners() {
    const status = getStatus();
    listeners.forEach(listener => listener(status));
  }

  function subscribe(listener: StatusListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function enqueue(key: string, request: SaveRequest<T>): Promise<T | SupersededResult> {
    return new Promise<T | SupersededResult>((resolve, reject) => {
      // Coalesce: if there's already a queued item for this key, replace it
      const superseded = queued.get(key);
      if (superseded) {
        // Settle the superseded promise so its caller's transition completes
        superseded.resolve({ superseded: true });
      }
      
      queued.set(key, { request, resolve, reject });

      // If nothing is in flight for this key, start processing
      if (!inFlight.has(key)) {
        processNext(key);
      }
      
      notifyListeners();
    });
  }

  async function processNext(key: string): Promise<void> {
    const item = queued.get(key);
    if (!item) return;

    // Move from queued to in-flight
    queued.delete(key);
    notifyListeners();
    
    const promise = (async () => {
      try {
        const result = await item.request();
        item.resolve(result);
        // Clear last failed on success
        lastFailed.delete(key);
        return result;
      } catch (error) {
        item.reject(error);
        // Store for retry
        lastFailed.set(key, item.request);
        throw error;
      } finally {
        // Remove from in-flight
        inFlight.delete(key);
        notifyListeners();
        // Process next queued item for this key if any
        if (queued.has(key)) {
          processNext(key);
        }
      }
    })();

    inFlight.set(key, promise);
  }

  function hasPending(): boolean {
    return inFlight.size > 0 || queued.size > 0;
  }

  function getInFlightKeys(): string[] {
    return Array.from(inFlight.keys());
  }

  function getQueuedKeys(): string[] {
    return Array.from(queued.keys());
  }
  
  function retry(key: string): Promise<T | SupersededResult> | null {
    const request = lastFailed.get(key);
    if (!request) return null;
    return enqueue(key, request);
  }

  /** Flush all queued items immediately (used on pagehide) */
  async function flush(): Promise<void> {
    // Wait for all in-flight and queued items to complete
    const allPromises: Promise<unknown>[] = [
      ...Array.from(inFlight.values()),
    ];
    
    // Start processing any queued items immediately
    for (const key of queued.keys()) {
      if (!inFlight.has(key)) {
        processNext(key);
        const promise = inFlight.get(key);
        if (promise) allPromises.push(promise);
      }
    }

    await Promise.allSettled(allPromises);
  }

  return {
    enqueue,
    hasPending,
    getStatus,
    getInFlightKeys,
    getQueuedKeys,
    flush,
    subscribe,
    retry,
  };
}
