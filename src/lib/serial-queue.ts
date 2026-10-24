/**
 * Serial queue for async operations.
 *
 * Ensures operations run one at a time, in the order they were enqueued.
 * Tolerates failures: if one operation rejects, the queue continues with the next.
 *
 * @example
 *   const { enqueue, pending } = createSerialQueue();
 *   enqueue(() => saveSettings({ theme: 'dark' }));
 *   enqueue(() => saveSettings({ language: 'en' }));
 */

export type SerialQueue = {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>;
  pending: () => number;
};

export function createSerialQueue(): SerialQueue {
  let tail = Promise.resolve();
  let pendingCount = 0;

  return {
    enqueue<T>(operation: () => Promise<T>): Promise<T> {
      pendingCount++;
      
      // Chain this operation after the current tail
      const promise = tail.then(
        () => operation(),
        () => operation(), // Run even if previous operation failed
      ).finally(() => {
        pendingCount--;
      });

      // Update tail to wait for this operation to complete (success or failure)
      tail = promise.then(
        () => undefined,
        () => undefined,
      );

      return promise;
    },

    pending(): number {
      return pendingCount;
    },
  };
}
