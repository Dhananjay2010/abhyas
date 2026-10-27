#!/usr/bin/env -S npx tsx
/**
 * CLI wrapper for database reset guard.
 * Reads from environment and file system, then calls the pure guard function.
 */

import { checkDbResetAllowed, parseProjectId } from "./db-reset-guard";
import * as fs from "fs";
import * as path from "path";

const realDb = process.env.REAL_DB;
const supabaseUrl = process.env.SUPABASE_URL;

// Read config.toml if it exists
let configContent: string | null = null;
try {
  const configPath = path.join(process.cwd(), "supabase", "config.toml");
  configContent = fs.readFileSync(configPath, "utf8");
} catch {
  // Config not readable, pass null
}

const result = checkDbResetAllowed(realDb, supabaseUrl, configContent);

if (!result.allowed) {
  console.error("❌ Database reset not allowed");
  console.error(`   Reason: ${result.reason}`);
  console.error();
  console.error("   To allow database reset:");
  console.error("   1. Set REAL_DB=1 to enable DB operations");
  console.error("   2. In CI: CI=true is automatically set");
  console.error("   3. Locally: Set ALLOW_DB_RESET=1 with non-default SUPABASE_URL host:port AND project_id");
  console.error();
  process.exit(1);
}

console.log(`✓ Database reset allowed: ${result.reason}`);
