#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";

const [, , file, search, replace] = process.argv;

if (!file || !search || !replace) {
  console.error("Usage: mutate.ts <file> <search> <replace>");
  process.exit(1);
}

try {
  const content = readFileSync(file, "utf8");

  // Count occurrences (literal match)
  const count = content.split(search).length - 1;

  if (count === 0) {
    console.error("ERROR: Pattern not found");
    process.exit(1);
  }

  if (count > 1) {
    console.error(`ERROR: Pattern occurs ${count} times, need exactly 1`);
    process.exit(1);
  }

  // Replace
  const newContent = content.replace(search, replace);
  writeFileSync(file, newContent, "utf8");

  process.exit(0);
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("ERROR:", message);
  process.exit(1);
}
