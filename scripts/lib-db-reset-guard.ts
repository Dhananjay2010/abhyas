/**
 * Shared DB-reset guard: pure decision function for TypeScript scripts
 * Returns { allow: boolean, reason: string }
 * Never connects to a DB, never runs external commands
 */

export interface GuardDecision {
  allow: boolean;
  reason: string;
}

export function checkDbResetGuard(): GuardDecision {
  // Rule 1: CI=true always allows
  if (process.env.CI === "true") {
    return { allow: true, reason: "CI=true" };
  }

  // Rule 2: ALLOW_DB_RESET must be set
  if (process.env.ALLOW_DB_RESET !== "1") {
    return {
      allow: false,
      reason: "ALLOW_DB_RESET not set to 1 (local DB operations require explicit opt-in)",
    };
  }

  // Rule 3: Require BOTH non-default SUPABASE_URL host:port AND non-default project_id
  const supabaseUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
  const projectId = process.env.SUPABASE_PROJECT_ID || "Fitness";

  // Parse SUPABASE_URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    return {
      allow: false,
      reason: "SUPABASE_URL is not a valid URL",
    };
  }

  // Check host and port
  const defaultHosts = ["127.0.0.1", "localhost"];
  const defaultPort = "54321";
  
  const isDefaultHost = defaultHosts.includes(parsedUrl.hostname);
  const port = parsedUrl.port || (parsedUrl.protocol === "https:" ? "443" : "80");
  const isDefaultPort = port === defaultPort;

  if (isDefaultHost && isDefaultPort) {
    return {
      allow: false,
      reason: `SUPABASE_URL points to default local stack (${parsedUrl.hostname}:${port}). Set SUPABASE_URL to a dedicated instance`,
    };
  }

  // Check project_id
  const defaultProject = "Fitness";
  if (projectId === defaultProject) {
    return {
      allow: false,
      reason: `project_id is default ('${defaultProject}'). Set SUPABASE_PROJECT_ID or change supabase/config.toml`,
    };
  }

  return {
    allow: true,
    reason: `ALLOW_DB_RESET=1 with non-default SUPABASE_URL (${parsedUrl.hostname}:${port}) and project_id (${projectId})`,
  };
}

/**
 * Check if REAL_DB tests should run
 * Returns { run: boolean, reason: string }
 */
export function checkRealDbTest(): GuardDecision {
  // Must have REAL_DB=1
  if (process.env.REAL_DB !== "1") {
    return {
      allow: false,
      reason: "REAL_DB=1 not set",
    };
  }

  // Then apply the same guard as reset operations
  return checkDbResetGuard();
}
