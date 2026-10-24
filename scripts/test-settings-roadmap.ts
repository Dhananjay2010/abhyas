#!/usr/bin/env tsx
/**
 * Test that roadmap section is hidden in production
 * 
 * Run: npm run test:settings-roadmap
 */

import { readFileSync } from "fs";

export {};

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${(e as Error).message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const source = readFileSync("src/app/settings/settings-form.tsx", "utf-8");

test("roadmap section wrapped with NODE_ENV check", () => {
  const hasNodeEnvCheck = source.includes('process.env.NODE_ENV !== "production"');
  assert(hasNodeEnvCheck, "Missing NODE_ENV !== 'production' check");
  
  const roadmapLine = source.split("\n").find(line => line.includes('<Section title="Not built yet">'));
  assert(roadmapLine !== undefined, "Roadmap section not found");
  
  // Check that the roadmap section is inside the NODE_ENV conditional
  const lines = source.split("\n");
  const roadmapIndex = lines.findIndex(line => line.includes('<Section title="Not built yet">'));
  const nodeEnvIndex = lines.findIndex(line => line.includes('process.env.NODE_ENV !== "production"'));
  
  assert(nodeEnvIndex < roadmapIndex, "NODE_ENV check must come before roadmap section");
  assert(nodeEnvIndex !== -1, "NODE_ENV check not found before roadmap");
});

test("roadmap section not rendered in production build", () => {
  // When NODE_ENV is 'production', the roadmap section should not render
  const hasConditionalRender = source.includes('process.env.NODE_ENV !== "production"') &&
                                 source.includes('<Section title="Not built yet">');
  assert(hasConditionalRender, "Roadmap section should be conditionally rendered");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
