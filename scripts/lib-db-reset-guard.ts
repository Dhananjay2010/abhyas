/**
 * Shared DB-reset guard: pure decision function for TypeScript scripts
 * Returns { allow: boolean, reason: string }
 * Never connects to a DB, never runs external commands
 */

import { readFileSync } from "fs";
import { parse as parseToml } from "smol-toml";

export interface GuardDecision {
  allow: boolean;
  reason: string;
}

function isLoopbackAddress(hostname: string): boolean {
  // Check various loopback representations
  if (hostname === "localhost" || hostname.startsWith("localhost.")) {
    return true;
  }
  if (hostname === "127.0.0.1" || /^127\./.test(hostname)) {
    return true;
  }
  if (hostname === "::1" || hostname === "[::1]") {
    return true;
  }
  if (hostname === "[::ffff:127.0.0.1]" || /^\[::ffff:127\./.test(hostname)) {
    return true;
  }
  if (hostname === "0.0.0.0") {
    return true;
  }
  return false;
}

export function checkDbResetGuard(
  configPath: string = "supabase/config.toml"
): GuardDecision {
  // Rule 1: CI=true always allows
  if (process.env.CI === "true") {
    return { allow: true, reason: "CI=true" };
  }

  // Rule 2: ALLOW_DB_RESET must be set
  if (process.env.ALLOW_DB_RESET !== "1") {
    return {
      allow: false,
      reason:
        "ALLOW_DB_RESET not set to 1 (local DB operations require explicit opt-in)",
    };
  }

  // Rule 3: Refuse if SUPABASE_* env overrides are set
  if (process.env.SUPABASE_PROJECT_ID) {
    return {
      allow: false,
      reason:
        "SUPABASE_PROJECT_ID env var is set (remove it or unset to prevent config.toml bypass)",
    };
  }

  if (process.env.SUPABASE_DB_PORT) {
    return {
      allow: false,
      reason:
        "SUPABASE_DB_PORT env var is set (remove it or unset to prevent config.toml bypass)",
    };
  }

  // Rule 4: Check for psql env vars
  if (process.env.PGHOST) {
    return {
      allow: false,
      reason: "PGHOST env var is set (unset it to avoid psql connection override)",
    };
  }

  if (process.env.PGPORT) {
    return {
      allow: false,
      reason: "PGPORT env var is set (unset it to avoid psql connection override)",
    };
  }

  if (process.env.PGSERVICE) {
    return {
      allow: false,
      reason:
        "PGSERVICE env var is set (unset it to avoid psql connection override)",
    };
  }

  if (process.env.PGHOSTADDR) {
    return {
      allow: false,
      reason:
        "PGHOSTADDR env var is set (unset it to avoid psql connection override)",
    };
  }

  // Rule 5: Parse config.toml
  let configContent: string;
  try {
    configContent = readFileSync(configPath, "utf-8");
  } catch (error) {
    return {
      allow: false,
      reason: `Failed to read ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(configContent) as Record<string, unknown>;
  } catch (error) {
    return {
      allow: false,
      reason: `Failed to parse ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const projectId = (parsed.project_id as string) || "";
  const dbConfig = (parsed.db as Record<string, unknown>) || {};
  const dbPort = (dbConfig.port as number) || 54322;

  // Check for env() in project_id
  if (projectId.includes("env(")) {
    return {
      allow: false,
      reason: "project_id contains env() reference (unresolvable)",
    };
  }

  // Check project_id (must be non-default)
  const defaultProject = "Fitness";
  if (!projectId || projectId === defaultProject) {
    return {
      allow: false,
      reason: `project_id in ${configPath} is default ('${defaultProject}') or not set. Change project_id to a non-default value`,
    };
  }

  // Check port (must be non-default)
  const defaultPort = 54322;
  if (dbPort === defaultPort) {
    return {
      allow: false,
      reason: `DB port in ${configPath} is default (${defaultPort}). Change [db] port to a non-default value (e.g., 54333)`,
    };
  }

  // Rule 6: SUPABASE_DB_URL is required
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    return {
      allow: false,
      reason:
        "SUPABASE_DB_URL is required for local DB operations (set it to match your config.toml [db] port)",
    };
  }

  // Rule 7: Refuse SUPABASE_DB_URL with query string override params
  if (dbUrl.includes("?")) {
    if (
      /[?&]port=/.test(dbUrl) ||
      /[?&]host=/.test(dbUrl) ||
      /[?&]hostaddr=/.test(dbUrl) ||
      /[?&]service=/.test(dbUrl)
    ) {
      return {
        allow: false,
        reason:
          "SUPABASE_DB_URL contains override params in query string (port=, host=, hostaddr=, or service=)",
      };
    }
  }

  // Rule 8: Refuse multi-host URLs
  if (dbUrl.includes(",")) {
    return {
      allow: false,
      reason: "SUPABASE_DB_URL contains multiple hosts (comma-separated)",
    };
  }

  // Rule 9: Parse and validate SUPABASE_DB_URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(dbUrl);
  } catch {
    return {
      allow: false,
      reason: "SUPABASE_DB_URL is not a valid URL",
    };
  }

  const urlHostname = parsedUrl.hostname;
  const urlPort = parsedUrl.port || "5432";

  // Must be loopback
  if (!isLoopbackAddress(urlHostname)) {
    return {
      allow: false,
      reason: `SUPABASE_DB_URL hostname (${urlHostname}) is not a local address`,
    };
  }

  // Must match config port
  if (urlPort !== String(dbPort)) {
    return {
      allow: false,
      reason: `SUPABASE_DB_URL port (${urlPort}) must match config.toml [db] port (${dbPort})`,
    };
  }

  // Additional safety: refuse default port
  if (urlPort === "54322") {
    return {
      allow: false,
      reason: "SUPABASE_DB_URL port is default 54322 (must use isolated port)",
    };
  }

  return {
    allow: true,
    reason: `ALLOW_DB_RESET=1 with non-default port (${dbPort}) and project_id (${projectId}) in ${configPath}, SUPABASE_DB_URL=${urlHostname}:${urlPort}`,
  };
}

/**
 * Check if REAL_DB tests should run
 * Returns { run: boolean, reason: string }
 */
export function checkRealDbTest(
  configPath: string = "supabase/config.toml"
): GuardDecision {
  // Must have REAL_DB=1
  if (process.env.REAL_DB !== "1") {
    return {
      allow: false,
      reason: "REAL_DB=1 not set",
    };
  }

  // Then apply the same guard as reset operations
  return checkDbResetGuard(configPath);
}
