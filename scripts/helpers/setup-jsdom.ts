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

// Set React act environment flag
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
