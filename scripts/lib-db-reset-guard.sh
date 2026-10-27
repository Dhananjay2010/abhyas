#!/usr/bin/env bash
# Shared DB-reset guard: pure decision function for bash scripts
# Returns 0 (allow) or 1 (refuse) based on env and config
# Never runs supabase, psql, or connects to a DB

check_db_reset_guard_bash() {
  local mode="${1:-check}" # check | explain
  local config_path="${2:-supabase/config.toml}"
  
  # Rule 1: CI=true always allows
  if [ "${CI:-}" = "true" ]; then
    [ "$mode" = "explain" ] && echo "ALLOW: CI=true"
    return 0
  fi
  
  # Rule 1b: CI set to non-"true" value is refused (e.g. CI=1)
  if [ -n "${CI:-}" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: CI is set to '${CI}' (only CI=true allows, not CI=1 or other values)"
    return 1
  fi
  
  # Rule 2: ALLOW_DB_RESET must be set
  if [ "${ALLOW_DB_RESET:-}" != "1" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: ALLOW_DB_RESET not set to 1 (local DB reset requires explicit opt-in)"
    return 1
  fi
  
  # Rule 3: Refuse if SUPABASE_* env overrides are set (Supabase CLI v2.x honours these)
  if [ -n "${SUPABASE_PROJECT_ID:-}" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_PROJECT_ID env var is set (remove it or unset to prevent config.toml bypass)"
    return 1
  fi
  
  if [ -n "${SUPABASE_DB_PORT:-}" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_DB_PORT env var is set (remove it or unset to prevent config.toml bypass)"
    return 1
  fi
  
  if [ -n "${SUPABASE_WORKDIR:-}" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_WORKDIR env var is set (remove it to prevent CLI target override)"
    return 1
  fi
  
  # Refuse other SUPABASE_* vars that could redirect CLI operations
  local var_name
  for var_name in $(compgen -e | grep '^SUPABASE_'); do
    case "$var_name" in
      SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)
        # Allowed
        ;;
      *)
        [ "$mode" = "explain" ] && echo "REFUSE: $var_name env var is set (unset non-allowlisted SUPABASE_* variables)"
        return 1
        ;;
    esac
  done
  
  # Rule 4: Check for psql env vars that override connection params
  if [ -n "${PGHOST:-}" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: PGHOST env var is set (unset it to avoid psql connection override)"
    return 1
  fi
  
  if [ -n "${PGPORT:-}" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: PGPORT env var is set (unset it to avoid psql connection override)"
    return 1
  fi
  
  if [ -n "${PGSERVICE:-}" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: PGSERVICE env var is set (unset it to avoid psql connection override)"
    return 1
  fi
  
  if [ -n "${PGHOSTADDR:-}" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: PGHOSTADDR env var is set (unset it to avoid psql connection override)"
    return 1
  fi
  
  # Rule 5: Read project_id and [db] port from config.toml
  if [ ! -f "$config_path" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: $config_path not found"
    return 1
  fi
  
  # Use a proper TOML parser via Node.js with smol-toml (pass config path as argv, not interpolated)
  local config_json=$(node -e "
    const fs = require('fs');
    let parse;
    try {
      parse = require('smol-toml').parse;
    } catch (e) {
      console.log('PARSE_ERROR:smol-toml module not found (run npm install)');
      process.exit(1);
    }
    try {
      const configPath = process.argv[1];
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = parse(content);
      
      // Validate project_id type
      const projectId = parsed.project_id;
      if (projectId !== undefined && typeof projectId !== 'string') {
        console.log('PARSE_ERROR:project_id must be a string, got ' + typeof projectId);
        process.exit(1);
      }
      
      console.log(JSON.stringify({
        project_id: projectId || '',
        db_port: (parsed.db && parsed.db.port) || 54322,
        api_port: (parsed.api && parsed.api.port) || 54321
      }));
    } catch (e) {
      console.log('PARSE_ERROR:' + e.message);
    }
  " "$config_path" 2>/dev/null)
  
  if [[ "$config_json" == PARSE_ERROR:* ]]; then
    [ "$mode" = "explain" ] && echo "REFUSE: Failed to parse $config_path: ${config_json#PARSE_ERROR:}"
    return 1
  fi
  
  local project_id=$(echo "$config_json" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.project_id)" 2>/dev/null)
  local db_port=$(echo "$config_json" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.db_port)" 2>/dev/null)
  local api_port=$(echo "$config_json" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.api_port)" 2>/dev/null)
  
  # Check for env() in project_id (unresolvable)
  if [[ "$project_id" == *"env("* ]]; then
    [ "$mode" = "explain" ] && echo "REFUSE: project_id contains env() reference (unresolvable)"
    return 1
  fi
  
  # Default values that must be overridden
  local default_port="54322"
  local default_project="Fitness"
  
  # Check port (must be non-default)
  if [ "$db_port" = "$default_port" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: DB port in $config_path is default ($default_port). Change [db] port to a non-default value (e.g., 54333)"
    return 1
  fi
  
  # Check project_id (must be non-default)
  if [ -z "$project_id" ] || [ "$project_id" = "$default_project" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: project_id in $config_path is default ('$default_project') or not set. Change project_id to a non-default value"
    return 1
  fi
  
  # Rule 6: Outside CI, SUPABASE_DB_URL is REQUIRED
  if [ -z "${SUPABASE_DB_URL:-}" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_DB_URL is required for local DB operations (set it to match your config.toml [db] port)"
    return 1
  fi
  
  # Rule 7: Refuse SUPABASE_DB_URL with query string, percent-encoding (MED-3)
  local db_url="$SUPABASE_DB_URL"
  # Refuse query params or percent-encoding (MED-3)
  # Note: This fails closed on legitimate uses like %-encoded passwords and ?sslmode=require
  # Rationale: Query params and percent-encoding can bypass host/port checks via libpq overrides
  if [[ "$db_url" == *"?"* ]] || [[ "$db_url" == *"%"* ]]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_DB_URL contains '?' or '%' (query params or percent-encoding not allowed)"
    return 1
  fi
  
  # Rule 8: Refuse multi-host URLs
  if [[ "$db_url" == *","* ]]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_DB_URL contains multiple hosts (comma-separated)"
    return 1
  fi
  
  # Rule 9: Verify SUPABASE_DB_URL targets localhost on the config port
  local U="$SUPABASE_DB_URL"
  export U
  local url_info=$(node -e "
    try {
      const url = new URL(process.env.U);
      const hostname = url.hostname.toLowerCase();
      const port = url.port || '5432';
      
      // Strict loopback check
      const isLocal = hostname === 'localhost' ||
                     (hostname === '127.0.0.1' || /^127\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\$/.test(hostname)) ||
                     hostname === '[::1]' ||
                     hostname === '::1' ||
                     hostname === '0.0.0.0';
      
      console.log(JSON.stringify({ hostname: url.hostname, port, isLocal }));
    } catch (e) {
      console.log('INVALID');
    }
  " 2>/dev/null)
  
  if [ "$url_info" = "INVALID" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_DB_URL is not a valid URL"
    return 1
  fi
  
  local url_hostname=$(echo "$url_info" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.hostname)" 2>/dev/null)
  local url_port=$(echo "$url_info" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.port)" 2>/dev/null)
  local is_local=$(echo "$url_info" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.isLocal)" 2>/dev/null)
  
  # Must be local
  if [ "$is_local" != "true" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_DB_URL hostname ($url_hostname) is not a local address"
    return 1
  fi
  
  # Must match config port
  if [ "$url_port" != "$db_port" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_DB_URL port ($url_port) must match config.toml [db] port ($db_port)"
    return 1
  fi
  
  # Additional check: refuse if port is default 54322 (double safety)
  if [ "$url_port" = "54322" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_DB_URL port is default 54322 (must use isolated port)"
    return 1
  fi
  
  # HIGH-1: SUPABASE_URL is required and must match config [api] port
  if [ -z "${SUPABASE_URL:-}" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_URL is required (tests use this to connect to the API - set it to match config.toml [api] port)"
    return 1
  fi
  
  local supabase_url="$SUPABASE_URL"  
  # Refuse SUPABASE_URL with query string or percent-encoding (MED-3)
  # Note: This fails closed on legitimate uses like %-encoded paths
  # Rationale: Query params and percent-encoding can bypass host/port validation
  if [[ "$supabase_url" == *"?"* ]] || [[ "$supabase_url" == *"%"* ]]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_URL contains '?' or '%' (query params or percent-encoding not allowed)"
    return 1
  fi
  
  export U="$supabase_url"
  local api_url_info=$(node -e "
    try {
      const url = new URL(process.env.U);
      const hostname = url.hostname.toLowerCase();
      const port = url.port || '80';
      
      // Strict loopback check
      const isLocal = hostname === 'localhost' ||
                     (hostname === '127.0.0.1' || /^127\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\$/.test(hostname)) ||
                     hostname === '[::1]' ||
                     hostname === '::1' ||
                     hostname === '0.0.0.0';
      
      console.log(JSON.stringify({ hostname: url.hostname, port, isLocal }));
    } catch (e) {
      console.log('INVALID');
    }
  " 2>/dev/null)
  
  if [ "$api_url_info" = "INVALID" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_URL is not a valid URL"
    return 1
  fi
  
  local api_hostname=$(echo "$api_url_info" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.hostname)" 2>/dev/null)
  local api_port_actual=$(echo "$api_url_info" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.port)" 2>/dev/null)
  local api_is_local=$(echo "$api_url_info" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.isLocal)" 2>/dev/null)
  
  if [ "$api_is_local" != "true" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_URL hostname ($api_hostname) is not a local address"
    return 1
  fi
  
  if [ "$api_port_actual" != "$api_port" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_URL port ($api_port_actual) must match config.toml [api] port ($api_port)"
    return 1
  fi
  
  if [ "$api_port_actual" = "54321" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_URL port is default 54321 (must use isolated port)"
    return 1
  fi
  
  # NEXT_PUBLIC_SUPABASE_URL is required and must match SUPABASE_URL (normalized)
  if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: NEXT_PUBLIC_SUPABASE_URL is required but unset"
    return 1
  fi
  
  # Normalize both URLs for comparison (scheme, host, port, path)
  local normalized_supabase normalized_next_public
  normalized_supabase=$(node -e "
    try {
      const u = new URL('$SUPABASE_URL');
      const host = u.hostname.toLowerCase();
      // Normalize localhost and 127.0.0.1
      const normalizedHost = (host === 'localhost' || host === '127.0.0.1' || /^127\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\$/.test(host)) ? 'localhost' : host;
      const port = u.port || (u.protocol === 'https:' ? '443' : '80');
      const path = u.pathname.replace(/\\/+\$/, ''); // strip trailing slashes
      console.log(\`\${u.protocol}//\${normalizedHost}:\${port}\${path}\`);
    } catch (e) {
      console.log('INVALID');
    }
  " 2>/dev/null)
  
  normalized_next_public=$(node -e "
    try {
      const u = new URL('$NEXT_PUBLIC_SUPABASE_URL');
      const host = u.hostname.toLowerCase();
      const normalizedHost = (host === 'localhost' || host === '127.0.0.1' || /^127\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\$/.test(host)) ? 'localhost' : host;
      const port = u.port || (u.protocol === 'https:' ? '443' : '80');
      const path = u.pathname.replace(/\\/+\$/, '');
      console.log(\`\${u.protocol}//\${normalizedHost}:\${port}\${path}\`);
    } catch (e) {
      console.log('INVALID');
    }
  " 2>/dev/null)
  
  if [ "$normalized_next_public" = "INVALID" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: NEXT_PUBLIC_SUPABASE_URL is not a valid URL"
    return 1
  fi
  
  if [ "$normalized_supabase" != "$normalized_next_public" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: NEXT_PUBLIC_SUPABASE_URL ($NEXT_PUBLIC_SUPABASE_URL) must match SUPABASE_URL ($SUPABASE_URL)"
    return 1
  fi
  
  [ "$mode" = "explain" ] && echo "ALLOW: ALLOW_DB_RESET=1 with non-default ports (db:$db_port, api:$api_port) and project_id ($project_id) in $config_path, SUPABASE_DB_URL=$url_hostname:$url_port, SUPABASE_URL=$api_hostname:$api_port_actual, NEXT_PUBLIC_SUPABASE_URL matches"
  return 0
}

# Export for sourcing
export -f check_db_reset_guard_bash 2>/dev/null || true
