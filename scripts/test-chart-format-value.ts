#!/usr/bin/env tsx
/**
 * Unit tests for chart formatValue thousands separators (item 3).
 * 
 * Tests that formatValue in charts.tsx uses thousands separators
 * like formatVolume in units.ts.
 */

// We need to extract formatValue or test it through the chart rendering
// For now, we'll test the expected behavior through string matching
// in the aria-label which uses formatValue

import { LineChart, type Point } from "../src/components/charts";
import { JSDOM } from "jsdom";

let exitCode = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error((err as Error).message);
    exitCode = 1;
  }
}

function assertContains(actual: string, expected: string, message?: string) {
  if (!actual.includes(expected)) {
    throw new Error(
      message || `Expected "${actual}" to contain "${expected}"`
    );
  }
}

// Set up JSDOM for React rendering
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
global.document = dom.window.document as unknown as Document;
global.window = dom.window as unknown as Window & typeof globalThis;

// Simple test: render a chart with large numbers and check the aria-label
test("formatValue adds thousands separator to volume", () => {
  const points: Point[] = [
    { label: "1 Oct", value: 11850 },
    { label: "2 Oct", value: 12000 },
  ];
  
  // Import React and ReactDOMServer for rendering
  const React = require("react");
  const ReactDOMServer = require("react-dom/server");
  
  const element = React.createElement(LineChart, {
    points,
    unit: "kg",
    title: "Volume",
    height: 140,
  });
  
  const html = ReactDOMServer.renderToStaticMarkup(element);
  
  // Check that the aria-label contains "11,850 kg" not "11850 kg"
  assertContains(html, "11,850 kg", "aria-label should contain '11,850 kg' with comma");
});

test("formatValue handles small numbers without thousands separator", () => {
  const points: Point[] = [
    { label: "1 Oct", value: 850 },
    { label: "2 Oct", value: 900 },
  ];
  
  const React = require("react");
  const ReactDOMServer = require("react-dom/server");
  
  const element = React.createElement(LineChart, {
    points,
    unit: "kg",
    title: "Volume",
    height: 140,
  });
  
  const html = ReactDOMServer.renderToStaticMarkup(element);
  
  // 850 stays as "850" (no comma needed)
  assertContains(html, "850 kg", "Small numbers don't need separators");
});

console.log("\nChart formatValue tests complete");
process.exit(exitCode);
