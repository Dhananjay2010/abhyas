/**
 * Setup jsdom globals BEFORE any React imports.
 * This must be the FIRST import in any test file.
 */

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
  runScripts: "dangerously",
});

// Set up globals before React/react-dom initialize
Object.defineProperty(global, "window", { value: dom.window, writable: true, configurable: true });
Object.defineProperty(global, "document", { value: dom.window.document, writable: true, configurable: true });
Object.defineProperty(global, "HTMLElement", { value: dom.window.HTMLElement, writable: true, configurable: true });
Object.defineProperty(global, "HTMLInputElement", { value: dom.window.HTMLInputElement, writable: true, configurable: true });
Object.defineProperty(global, "Event", { value: dom.window.Event, writable: true, configurable: true });
Object.defineProperty(global, "navigator", { value: dom.window.navigator, writable: true, configurable: true });
Object.defineProperty(global, "self", { value: dom.window, writable: true, configurable: true });

// Set React act environment flag
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Polyfill dialog.showModal() and dialog.close() for JSDOM
if (global.window && global.window.HTMLDialogElement) {
  if (!global.window.HTMLDialogElement.prototype.showModal) {
    global.window.HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
  }
  if (!global.window.HTMLDialogElement.prototype.close) {
    global.window.HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
  }
}

// Polyfill requestAnimationFrame for JSDOM
if (!global.requestAnimationFrame) {
  let rafId = 0;
  const rafCallbacks = new Map<number, FrameRequestCallback>();
  
  global.requestAnimationFrame = (callback: FrameRequestCallback) => {
    const id = ++rafId;
    rafCallbacks.set(id, callback);
    setImmediate(() => {
      const cb = rafCallbacks.get(id);
      if (cb) {
        rafCallbacks.delete(id);
        cb(Date.now());
      }
    });
    return id;
  };
}
if (!global.cancelAnimationFrame) {
  global.cancelAnimationFrame = (id: number) => {
    // No-op for this simple polyfill
  };
}

// Track router.refresh calls for tests
export const mockNextRouter = {
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
  back: () => {},
  forward: () => {},
  refreshCalls: [] as number[],
};

// Declare global mock type
declare global {
  var mockNextNavigation: {
    useRouter: () => {
      refresh: () => void;
      push: (...args: unknown[]) => void;
      replace: (...args: unknown[]) => void;
      prefetch: (...args: unknown[]) => void;
      back: () => void;
      forward: () => void;
    };
    usePathname: () => string;
    useSearchParams: () => URLSearchParams;
    useParams: () => Record<string, unknown>;
  };
}

// Mock next/navigation module before any imports
global.mockNextNavigation = {
  useRouter: () => ({
    refresh: () => {
      mockNextRouter.refreshCalls.push(Date.now());
      mockNextRouter.refresh();
    },
    push: mockNextRouter.push,
    replace: mockNextRouter.replace,
    prefetch: mockNextRouter.prefetch,
    back: mockNextRouter.back,
    forward: mockNextRouter.forward,
  }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
};

// Override module resolution for next/navigation
import { createRequire } from "module";

const testRequire = createRequire(import.meta.url);

type ModuleLoadFunction = (request: string, parent: unknown, isMain: boolean) => unknown;

interface ModuleWithLoad {
  _load: ModuleLoadFunction;
}

const Module = testRequire("module") as unknown as ModuleWithLoad;
const originalLoad = Module._load;

Module._load = function (request: string, parent: unknown, isMain: boolean): unknown {
  if (request === "next/navigation") {
    return global.mockNextNavigation;
  }
  return originalLoad.call(this, request, parent, isMain);
};
