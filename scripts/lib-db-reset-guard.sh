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
  
  # Use a proper TOML parser via Node.js with smol-toml
  local config_json=$(node -e "
    const fs = require('fs');
    const { parse } = require('smol-toml');
    try {
      const content = fs.readFileSync('$config_path', 'utf-8');
      const parsed = parse(content);
      console.log(JSON.stringify({
        project_id: parsed.project_id || '',
        db_port: (parsed.db && parsed.db.port) || 54322
      }));
    } catch (e) {
      console.log('PARSE_ERROR:' + e.message);
    }
  " 2>/dev/null)
  
  if [[ "$config_json" == PARSE_ERROR:* ]]; then
    [ "$mode" = "explain" ] && echo "REFUSE: Failed to parse $config_path: ${config_json#PARSE_ERROR:}"
    return 1
  fi
  
  local project_id=$(echo "$config_json" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.project_id)" 2>/dev/null)
  local db_port=$(echo "$config_json" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf-8')); console.log(d.db_port)" 2>/dev/null)
  
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
  
  # Rule 7: Refuse SUPABASE_DB_URL with query string or libpq override params
  local db_url="$SUPABASE_DB_URL"
  if [[ "$db_url" == *"?"* ]]; then
    if [[ "$db_url" == *"?port="* ]] || [[ "$db_url" == *"&port="* ]] || \
       [[ "$db_url" == *"?host="* ]] || [[ "$db_url" == *"&host="* ]] || \
       [[ "$db_url" == *"?hostaddr="* ]] || [[ "$db_url" == *"&hostaddr="* ]] || \
       [[ "$db_url" == *"?service="* ]] || [[ "$db_url" == *"&service="* ]]; then
      [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_DB_URL contains override params in query string (port=, host=, hostaddr=, or service=)"
      return 1
    fi
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
      const hostname = url.hostname;
      const port = url.port || '5432';
      
      // Check for loopback addresses
      const isLocal = hostname === 'localhost' || 
                     hostname.startsWith('localhost.') ||
                     hostname === '127.0.0.1' ||
                     /^127\\./.test(hostname) ||
                     hostname === '[::1]' ||
                     hostname === '::1' ||
                     hostname === '[::ffff:127.0.0.1]' ||
                     /^\[::ffff:127\./.test(hostname) ||
                     hostname === '0.0.0.0';
      
      console.log(JSON.stringify({ hostname, port, isLocal }));
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
  
  [ "$mode" = "explain" ] && echo "ALLOW: ALLOW_DB_RESET=1 with non-default port ($db_port) and project_id ($project_id) in $config_path, SUPABASE_DB_URL=$url_hostname:$url_port"
  return 0
}

# Export for sourcing
export -f check_db_reset_guard_bash 2>/dev/null || true
