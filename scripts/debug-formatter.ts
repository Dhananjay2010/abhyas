#!/usr/bin/env tsx
import { formatSessionDateTime } from "../src/lib/history/format-session-datetime";

console.log("Test 1: Auckland session from Kolkata");
const result1 = formatSessionDateTime('2026-10-23T18:00:00.000Z', '2026-10-24', 'Asia/Kolkata');
console.log("Result:", result1);

console.log("\nTest 2: null started_at");
const result2 = formatSessionDateTime(null, '2026-10-24', 'UTC');
console.log("Result:", result2);
