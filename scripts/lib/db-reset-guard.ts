/**
 * Database reset guard: prevents accidental resets on shared dev environments.
 * 
 * Mutant test scripts run `supabase db reset` against the local stack, which on
 * a shared box wipes everyone's data. This guard refuses to run unless:
 * 
 * - REAL_DB=1 (explicitly opt-in to real DB operations) AND
 * - (CI=true OR (ALLOW_DB_RESET=1 AND non-default host:port in SUPABASE_URL AND non-default project_id))
 * 
 * Call this at the top of any script that resets a database or deletes users.
 * 
 * FAIL-CLOSED: REAL_DB=1 required, plus CI or (non-default port AND project_id).
 */

const DEFAULT_PROJECT_ID = "Fitness";
const DEFAULT_HOSTS = ["127.0.0.1", "localhost"];
const DEFAULT_PORT = "54321";

export interface GuardResult {
  allowed: boolean;
  reason: string;
}

/**
 * Parse host and port from SUPABASE_URL.
 * Returns null if URL is invalid or doesn't contain port.
 */
export function parseSupabaseUrl(url: string | undefined): { host: string; port: string } | null {
  if (!url) return null;
  
  try {
    const parsed = new URL(url);
    if (!parsed.port) return null;
    return { host: parsed.hostname, port: parsed.port };
  } catch {
    return null;
  }
}

/**
 * Parse project_id from supabase/config.toml content.
 * This is a pure function for testing.
 */
export function parseProjectId(configContent: string | null): string {
  if (!configContent) return DEFAULT_PROJECT_ID;
  
  const match = configContent.match(/^project_id\s*=\s*"([^"]+)"/m);
  if (match && match[1]) {
    return match[1];
  }
  
  return DEFAULT_PROJECT_ID;
}

/**
 * Check if database reset is allowed in the current environment.
 * Pure check-only function - does not invoke supabase, psql, or any DB.
 * 
 * @param realDb - REAL_DB env var
 * @param supabaseUrl - SUPABASE_URL env var
 * @param configContent - content of supabase/config.toml (or null if not readable)
 * @returns GuardResult with allowed status and reason
 */
export function checkDbResetAllowed(
  realDb: string | undefined,
  supabaseUrl: string | undefined,
  configContent: string | null
): GuardResult {
  // Require REAL_DB=1 explicitly (NO-OP by default)
  if (realDb !== "1") {
    return {
      allowed: false,
      reason: "REAL_DB=1 not set (NO-OP by default, skipping DB operations)",
    };
  }

  // Always allow in CI when REAL_DB=1
  if (process.env.CI === "true") {
    return {
      allowed: true,
      reason: "REAL_DB=1 with CI environment (CI=true)",
    };
  }

  // Require ALLOW_DB_RESET=1 for local execution
  if (process.env.ALLOW_DB_RESET !== "1") {
    return {
      allowed: false,
      reason: "ALLOW_DB_RESET=1 not set. Set ALLOW_DB_RESET=1 with non-default SUPABASE_URL host:port AND project_id.",
    };
  }

  // Parse SUPABASE_URL
  const parsed = parseSupabaseUrl(supabaseUrl);
  if (!parsed) {
    return {
      allowed: false,
      reason: "SUPABASE_URL missing, invalid, or has no port",
    };
  }

  // Check host and port
  const isDefaultHost = DEFAULT_HOSTS.includes(parsed.host);
  const isDefaultPort = parsed.port === DEFAULT_PORT;
  
  if (isDefaultHost || isDefaultPort) {
    return {
      allowed: false,
      reason: `SUPABASE_URL uses default host/port (${parsed.host}:${parsed.port}). Expected non-default host AND port.`,
    };
  }

  // Check project_id
  const projectId = parseProjectId(configContent);
  if (projectId === DEFAULT_PROJECT_ID) {
    return {
      allowed: false,
      reason: `Using default project_id (${DEFAULT_PROJECT_ID}). Expected non-default project_id.`,
    };
  }

  return {
    allowed: true,
    reason: `REAL_DB=1 with ALLOW_DB_RESET=1 and non-default config: ${parsed.host}:${parsed.port}, project_id=${projectId}`,
  };
}
