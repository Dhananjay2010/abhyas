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
  
  # Rule 3: Read project_id and [db] port from config.toml (what supabase reset actually targets)
  # Ignore SUPABASE_PROJECT_ID env var to prevent guard bypass
  
  if [ ! -f "$config_path" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: $config_path not found"
    return 1
  fi
  
  # Extract project_id from config.toml
  local project_id=$(grep '^project_id' "$config_path" 2>/dev/null | head -1 | sed 's/.*"\(.*\)".*/\1/')
  
  # Extract db.port from config.toml (default is 54322)
  local db_port=$(grep -A 20 '^\[db\]' "$config_path" 2>/dev/null | grep '^port' | head -1 | sed 's/.*=\s*\([0-9]*\).*/\1/')
  if [ -z "$db_port" ]; then
    db_port="54322" # Supabase default
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
  
  # Rule 4: If SUPABASE_DB_URL is set, verify it targets the same port on localhost
  # (to prevent mismatch where guard passes but reset hits wrong DB)
  if [ -n "${SUPABASE_DB_URL:-}" ]; then
    # Extract host and port from SUPABASE_DB_URL safely (no injection risk)
    local U="$SUPABASE_DB_URL"
    export U
    local url_host_port=$(node -e "
      try {
        const url = new URL(process.env.U);
        console.log(url.hostname + ':' + (url.port || '5432'));
      } catch (e) {
        console.log('INVALID');
      }
    " 2>/dev/null)
    
    if [ "$url_host_port" = "INVALID" ]; then
      [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_DB_URL is not a valid URL"
      return 1
    fi
    
    # Check that SUPABASE_DB_URL points to localhost:$db_port
    local expected_localhost="localhost:$db_port"
    local expected_127="127.0.0.1:$db_port"
    
    if [ "$url_host_port" != "$expected_localhost" ] && [ "$url_host_port" != "$expected_127" ]; then
      [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_DB_URL ($url_host_port) must match config.toml [db] port on localhost (expected localhost:$db_port or 127.0.0.1:$db_port)"
      return 1
    fi
  fi
  
  [ "$mode" = "explain" ] && echo "ALLOW: ALLOW_DB_RESET=1 with non-default port ($db_port) and project_id ($project_id) in $config_path"
  return 0
}

# Export for sourcing
export -f check_db_reset_guard_bash 2>/dev/null || true
