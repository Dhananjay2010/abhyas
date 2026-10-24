/**
 * Serialized save queue: at most one request in flight per key.
 * While one is in flight, coalesce the latest pending patch for that key.
 * Ensures the last user choice is always the last write to the server.
 */

export type SaveRequest<T> = () => Promise<T>;

type QueuedItem<T> = {
  request: SaveRequest<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export type SaveQueueStatus = 
  | { state: "idle" }
  | { state: "saving"; key: string }
  | { state: "has-queued"; keys: string[] };

export function createSaveQueue<T>() {
  /** In-flight request per key */
  const inFlight = new Map<string, Promise<T>>();
  /** Latest queued request per key (coalesced) */
  const queued = new Map<string, QueuedItem<T>>();

  function getStatus(): SaveQueueStatus {
    if (inFlight.size === 0 && queued.size === 0) {
      return { state: "idle" };
    }
    if (inFlight.size > 0 && queued.size === 0) {
      return { state: "saving", key: Array.from(inFlight.keys())[0] };
    }
    return { state: "has-queued", keys: Array.from(queued.keys()) };
  }

  function enqueue(key: string, request: SaveRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Coalesce: if there's already a queued item for this key, replace it
      queued.set(key, { request, resolve, reject });

      // If nothing is in flight for this key, start processing
      if (!inFlight.has(key)) {
        processNext(key);
      }
    });
  }

  async function processNext(key: string): Promise<void> {
    const item = queued.get(key);
    if (!item) return;

    // Move from queued to in-flight
    queued.delete(key);
    
    const promise = (async () => {
      try {
        const result = await item.request();
        item.resolve(result);
        return result;
      } catch (error) {
        item.reject(error);
        throw error;
      } finally {
        // Remove from in-flight
        inFlight.delete(key);
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
  };
}
