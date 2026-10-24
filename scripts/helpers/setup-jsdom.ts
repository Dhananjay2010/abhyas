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

// Mock next/navigation module before any imports
// @ts-expect-error - global augmentation for testing
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
const Module = testRequire("module") as typeof import("module") & { _load: any };
const originalLoad = Module._load;

Module._load = function (request: string, parent: any, isMain: boolean) {
  if (request === "next/navigation") {
    // @ts-ignore
    return global.mockNextNavigation;
  }
  return originalLoad.call(this, request, parent, isMain);
};
