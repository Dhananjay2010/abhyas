/**
 * Outbox controller: wraps online event listener for testability.
 * 
 * Production code calls this to get start() and stop() functions.
 * Tests can inject a fake EventTarget and verify flush is called.
 */
export type OutboxController = {
  start: () => void;
  stop: () => void;
};

export function createOutboxController(params: {
  target: EventTarget;
  flush: () => void | Promise<void>;
}): OutboxController {
  const { target, flush } = params;
  
  const onOnline = () => {
    void flush();
  };
  
  let started = false;
  
  return {
    start() {
      if (started) return;
      started = true;
      target.addEventListener("online", onOnline);
    },
    
    stop() {
      if (!started) return;
      started = false;
      target.removeEventListener("online", onOnline);
    },
  };
}
