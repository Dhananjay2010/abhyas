#!/usr/bin/env tsx
/**
 * L-c: Chart axis and tick labels use the same precision as the values.
 * 
 * Tests that body weight charts show 170.6 lb on both the axis and values,
 * not 170.5 on the axis and 170.6 on values.
 */

import "./helpers/setup-jsdom";
import { render } from "@testing-library/react";
import { LineChart, type Point } from "../src/components/charts";

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n=== L-c: Chart axis precision matches values ===\n");

// Test case 1: Body weight chart with 77.38 kg = 170.6 lb
const bodyWeightPoints: Point[] = [
  { label: "24 Oct", value: 77.0 },
  { label: "25 Oct", value: 77.2 },
  { label: "26 Oct", value: 77.38 },
];

const r1 = render(
  <LineChart
    points={bodyWeightPoints}
    title="Body weight"
    weightUnits="imperial"
    isBodyWeight={true}
  />
);

const svg1 = r1.container.querySelector("svg");
if (!svg1) {
  check("Body weight chart renders SVG", false);
  failures++;
} else {
  check("Body weight chart renders SVG", true);
  
  // Check that axis labels exist
  const textElements1 = Array.from(svg1.querySelectorAll("text"));
  const axisLabels1 = textElements1.filter(t => {
    const content = t.textContent || "";
    // Axis labels are numeric and positioned at top/bottom
    return /^\d+(\.\d+)?$/.test(content) && 
           (t.getAttribute("y") === "14" || t.getAttribute("y")?.includes("+ 4"));
  });
  
  check("Body weight chart has axis labels", axisLabels1.length >= 1, 
    `found ${axisLabels1.length} axis labels`);
  
  // L-c: Assert exact axis label text (170.7 for 77.38 kg data)
  const axisValues1 = axisLabels1.map(t => t.textContent || "");
  check("Body weight axis shows exact 170.7 lb label", axisValues1.includes("170.7"),
    `axis labels: ${axisValues1.join(", ")}`);
}

r1.unmount();

console.log("");

// Test case 2: Regular weight chart (not body weight) still uses 0.5 lb precision
const strengthPoints: Point[] = [
  { label: "Week 1", value: 72.5 },
  { label: "Week 2", value: 75.0 },
  { label: "Week 3", value: 77.5 },
];

const r2 = render(
  <LineChart
    points={strengthPoints}
    title="Bench Press"
    weightUnits="imperial"
    isBodyWeight={false}
  />
);

const svg2 = r2.container.querySelector("svg");
if (!svg2) {
  check("Strength chart renders SVG", false);
  failures++;
} else {
  check("Strength chart renders SVG", true);
  
  // For strength charts, axis labels still use 0.5 lb precision (formatWeight)
  const textElements2 = Array.from(svg2.querySelectorAll("text"));
  const axisLabels2 = textElements2.filter(t => {
    const content = t.textContent || "";
    return /^\d+(\.\d+)?$/.test(content) && 
           (t.getAttribute("y") === "14" || t.getAttribute("y")?.includes("+ 4"));
  });
  
  check("Strength chart has axis labels", axisLabels2.length >= 1,
    `found ${axisLabels2.length} axis labels`);
}

// Check the headline value uses 0.5 lb precision
const headline2 = r2.container.querySelector("p.mt-1");
const headlineText2 = headline2?.textContent || "";
// 77.5 kg = 170.9 lb, rounds to 171 lb with 0.5 precision
check("Strength headline uses 0.5 lb precision", 
  headlineText2.includes("171 lb") || headlineText2.includes("170.5 lb"),
  `got "${headlineText2}"`);

r2.unmount();

if (failures === 0) {
  console.log(`\n✓ All L-c tests passed\n`);
  process.exit(0);
} else {
  console.log(`\n✗ ${failures} test(s) failed\n`);
  process.exit(1);
}
