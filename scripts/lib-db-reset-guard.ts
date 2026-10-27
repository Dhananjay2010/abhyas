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
  // Strict loopback check - case-sensitive, no evil subdomains
  const lower = hostname.toLowerCase();
  
  // localhost only (not localhost.evil.com)
  if (lower === "localhost") {
    return true;
  }
  
  // IPv4 127.0.0.0/8 (not 127.1 shorthand)
  if (lower === "127.0.0.1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) {
    return true;
  }
  
  // IPv6 loopback
  if (lower === "::1" || lower === "[::1]") {
    return true;
  }
  
  // IPv4-mapped IPv6 (but not [::ffff:127.0.0.1] - reject to force canonical form)
  if (lower.startsWith("[::ffff:127.") && lower.endsWith("]")) {
    const ipv4Part = lower.slice("[::ffff:".length, -1);
    if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipv4Part)) {
      return false; // Reject - use canonical [::1] or 127.x.x.x
    }
  }
  
  // unspecified (0.0.0.0)
  if (lower === "0.0.0.0") {
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
  
  // Rule 1b: CI set to non-"true" value is refused (e.g. CI=1)
  if (process.env.CI) {
    return {
      allow: false,
      reason: `CI is set to '${process.env.CI}' (only CI=true allows, not CI=1 or other values)`,
    };
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
  
  if (process.env.SUPABASE_WORKDIR) {
    return {
      allow: false,
      reason:
        "SUPABASE_WORKDIR env var is set (remove it to prevent CLI target override)",
    };
  }
  
  // Refuse other SUPABASE_* vars that could redirect CLI operations
  const allowedSupabaseVars = new Set([
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY", 
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  ]);
  
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("SUPABASE_") && !allowedSupabaseVars.has(key)) {
      return {
        allow: false,
        reason: `${key} env var is set (unset non-allowlisted SUPABASE_* variables)`,
      };
    }
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

  // Validate project_id type
  const rawProjectId = parsed.project_id;
  if (typeof rawProjectId !== "string" && rawProjectId !== undefined) {
    return {
      allow: false,
      reason: `project_id in ${configPath} must be a string, got ${typeof rawProjectId}`,
    };
  }
  
  const projectId = (rawProjectId as string | undefined) || "";
  const dbConfig = (parsed.db as Record<string, unknown>) || {};
  const dbPort = (dbConfig.port as number) || 54322;
  const apiConfig = (parsed.api as Record<string, unknown>) || {};
  const apiPort = (apiConfig.port as number) || 54321;

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

  // Rule 7: Refuse SUPABASE_DB_URL with query string or percent-encoding (MED-3)
  // Note: This fails closed on legitimate uses like %-encoded passwords and ?sslmode=require
  // Rationale: Query params and percent-encoding can bypass host/port checks via libpq overrides
  if (dbUrl.includes("?") || dbUrl.includes("%")) {
    return {
      allow: false,
      reason:
        "SUPABASE_DB_URL contains '?' or '%' (query params or percent-encoding not allowed)",
    };
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
  
  // HIGH-1: SUPABASE_URL is required and must match config [api] port
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    return {
      allow: false,
      reason:
        "SUPABASE_URL is required (tests use this to connect to the API - set it to match config.toml [api] port)",
    };
  }
  
  // Refuse SUPABASE_URL with query string or percent-encoding (MED-3)
  // Note: This fails closed on legitimate uses like %-encoded paths
  // Rationale: Query params and percent-encoding can bypass host/port validation
  if (supabaseUrl.includes("?") || supabaseUrl.includes("%")) {
    return {
      allow: false,
      reason:
        "SUPABASE_URL contains '?' or '%' (query params or percent-encoding not allowed)",
    };
  }
  
  let parsedSupabaseUrl: URL;
  try {
    parsedSupabaseUrl = new URL(supabaseUrl);
  } catch {
    return {
      allow: false,
      reason: "SUPABASE_URL is not a valid URL",
    };
  }
  
  const supabaseHostname = parsedSupabaseUrl.hostname;
  const supabasePort = parsedSupabaseUrl.port || "80";
  
  // Must be loopback
  if (!isLoopbackAddress(supabaseHostname)) {
    return {
      allow: false,
      reason: `SUPABASE_URL hostname (${supabaseHostname}) is not a local address`,
    };
  }
  
  // Must match config [api] port
  if (supabasePort !== String(apiPort)) {
    return {
      allow: false,
      reason: `SUPABASE_URL port (${supabasePort}) must match config.toml [api] port (${apiPort})`,
    };
  }
  
  // Refuse default API port
  if (supabasePort === "54321") {
    return {
      allow: false,
      reason: "SUPABASE_URL port is default 54321 (must use isolated port)",
    };
  }
  
  // NEXT_PUBLIC_SUPABASE_URL is required and must match SUPABASE_URL (normalized)
  const nextPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!nextPublicUrl) {
    return {
      allow: false,
      reason: "NEXT_PUBLIC_SUPABASE_URL is required but unset",
    };
  }
  
  // Normalize both URLs for comparison
  const normalizeUrl = (urlStr: string): string => {
    try {
      const u = new URL(urlStr);
      // Normalize localhost and 127.0.0.1
      let host = u.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
        host = 'localhost';
      }
      const port = u.port || (u.protocol === 'https:' ? '443' : '80');
      const path = u.pathname.replace(/\/+$/, ''); // strip trailing slashes
      return `${u.protocol}//${host}:${port}${path}`;
    } catch {
      return 'INVALID';
    }
  };
  
  const normalizedSupabase = normalizeUrl(supabaseUrl);
  const normalizedNextPublic = normalizeUrl(nextPublicUrl);
  
  if (normalizedNextPublic === 'INVALID') {
    return {
      allow: false,
      reason: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL",
    };
  }
  
  if (normalizedNextPublic !== normalizedSupabase) {
    return {
      allow: false,
      reason: `NEXT_PUBLIC_SUPABASE_URL (${nextPublicUrl}) must match SUPABASE_URL (${supabaseUrl})`,
    };
  }

  return {
    allow: true,
    reason: `ALLOW_DB_RESET=1 with non-default port (${dbPort}) and project_id (${projectId}) in ${configPath}, SUPABASE_DB_URL=${urlHostname}:${urlPort}, NEXT_PUBLIC_SUPABASE_URL matches`,
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
