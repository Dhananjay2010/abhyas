/**
 * Database reset guard: prevents accidental resets on shared dev environments.
 * 
 * Mutant test scripts run `supabase db reset` against the local stack, which on
 * a shared box wipes everyone's data. This guard refuses to run unless:
 * 
 * - CI=true (always allow in CI), OR
 * - ALLOW_DB_RESET=1 AND (non-default project_id OR non-default port)
 * 
 * Call this at the top of any script that resets a database or deletes users.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const DEFAULT_PROJECT_ID = "Fitness";
const DEFAULT_DB_PORT = "54322";

export interface GuardResult {
  allowed: boolean;
  reason: string;
}

/**
 * Check if database reset is allowed in the current environment.
 * 
 * @returns GuardResult with allowed status and reason
 */
export function checkDbResetAllowed(): GuardResult {
  // Always allow in CI
  if (process.env.CI === "true") {
    return {
      allowed: true,
      reason: "CI environment detected (CI=true)",
    };
  }

  // Require ALLOW_DB_RESET=1 for local execution
  if (process.env.ALLOW_DB_RESET !== "1") {
    return {
      allowed: false,
      reason: "ALLOW_DB_RESET=1 not set. Set ALLOW_DB_RESET=1 together with a non-default Supabase project or port.",
    };
  }

  // ALLOW_DB_RESET=1 is set, check for non-default configuration
  const projectId = getSupabaseProjectId();
  const dbPort = getSupabaseDbPort();

  if (projectId !== DEFAULT_PROJECT_ID) {
    return {
      allowed: true,
      reason: `ALLOW_DB_RESET=1 with non-default project_id: ${projectId}`,
    };
  }

  if (dbPort !== DEFAULT_DB_PORT) {
    return {
      allowed: true,
      reason: `ALLOW_DB_RESET=1 with non-default DB port: ${dbPort}`,
    };
  }

  return {
    allowed: false,
    reason: `ALLOW_DB_RESET=1 set, but using default project_id (${DEFAULT_PROJECT_ID}) and default port (${DEFAULT_DB_PORT}). Use a non-default configuration to reset the database.`,
  };
}

/**
 * Get the Supabase project ID from config.toml.
 */
function getSupabaseProjectId(): string {
  try {
    const configPath = path.join(process.cwd(), "supabase", "config.toml");
    const configContent = fs.readFileSync(configPath, "utf8");
    
    // Extract project_id from config.toml
    const match = configContent.match(/^project_id\s*=\s*"([^"]+)"/m);
    if (match && match[1]) {
      return match[1];
    }
  } catch (error) {
    // If we can't read the config, assume default
  }
  
  return DEFAULT_PROJECT_ID;
}

/**
 * Get the Supabase database port from config.toml or supabase status.
 */
function getSupabaseDbPort(): string {
  try {
    // Try to get the port from supabase status
    const statusOutput = execSync("supabase status --output json 2>/dev/null", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    
    const status = JSON.parse(statusOutput);
    const dbUrl = status.DB_URL || "";
    
    // Extract port from URL like postgresql://postgres:postgres@localhost:54322/postgres
    const portMatch = dbUrl.match(/:(\d+)\//);
    if (portMatch && portMatch[1]) {
      return portMatch[1];
    }
  } catch (error) {
    // If supabase status fails, try config.toml
    try {
      const configPath = path.join(process.cwd(), "supabase", "config.toml");
      const configContent = fs.readFileSync(configPath, "utf8");
      
      // Look for port under [db] section specifically
      // Find [db] section and extract port from it
      const dbSectionStart = configContent.indexOf("[db]");
      if (dbSectionStart !== -1) {
        const nextSectionStart = configContent.indexOf("[", dbSectionStart + 1);
        const dbSection = nextSectionStart === -1 
          ? configContent.slice(dbSectionStart)
          : configContent.slice(dbSectionStart, nextSectionStart);
        
        const portMatch = dbSection.match(/^\s*port\s*=\s*(\d+)/m);
        if (portMatch && portMatch[1]) {
          return portMatch[1];
        }
      }
    } catch {
      // Fall through to default
    }
  }
  
  return DEFAULT_DB_PORT;
}

/**
 * Enforce the database reset guard. Exits with code 1 if not allowed.
 * 
 * Call this at the top of scripts that reset databases or delete users.
 */
export function enforceDbResetGuard(): void {
  const result = checkDbResetAllowed();
  
  if (!result.allowed) {
    console.error("❌ Database reset not allowed");
    console.error(`   Reason: ${result.reason}`);
    console.error();
    console.error("   To allow database reset:");
    console.error("   1. In CI: CI=true is automatically set");
    console.error("   2. Locally: Set ALLOW_DB_RESET=1 with a non-default Supabase configuration");
    console.error("      - Use a different project_id in supabase/config.toml, OR");
    console.error("      - Run supabase on a non-default port");
    console.error();
    process.exit(1);
  }
  
  console.log(`✓ Database reset allowed: ${result.reason}`);
}
