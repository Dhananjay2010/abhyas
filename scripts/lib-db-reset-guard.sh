#!/usr/bin/env bash
# Shared DB-reset guard: pure decision function for bash scripts
# Returns 0 (allow) or 1 (refuse) based on env and config
# Never runs supabase, psql, or connects to a DB

check_db_reset_guard_bash() {
  local mode="${1:-check}" # check | explain
  
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
  
  # Rule 3: Require BOTH non-default port AND non-default project_id
  # Parse port from SUPABASE_DB_URL (must be provided for explicit targeting)
  if [ -z "${SUPABASE_DB_URL:-}" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_DB_URL not set. Must explicitly target a non-default DB"
    return 1
  fi
  
  # Use node to parse the URL properly
  local db_port
  db_port=$(node -e "
    try {
      const url = new URL('${SUPABASE_DB_URL}');
      console.log(url.port || '5432');
    } catch (e) {
      console.log('PARSE_ERROR');
    }
  " 2>/dev/null)
  
  if [ "$db_port" = "PARSE_ERROR" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: SUPABASE_DB_URL is not a valid URL"
    return 1
  fi
  
  # Get project_id from env or config.toml
  local project_id="${SUPABASE_PROJECT_ID:-}"
  if [ -z "$project_id" ] && [ -f "supabase/config.toml" ]; then
    project_id=$(grep '^project_id' supabase/config.toml 2>/dev/null | head -1 | sed 's/.*"\(.*\)".*/\1/')
  fi
  
  # Default values that must be overridden
  local default_port="54322"
  local default_project="Fitness"
  
  # Check port (must be non-default)
  if [ "$db_port" = "$default_port" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: DB port is default ($default_port). Set SUPABASE_DB_URL with a non-default port (e.g., :54333)"
    return 1
  fi
  
  # Check project_id (must be non-default)
  if [ -z "$project_id" ] || [ "$project_id" = "$default_project" ]; then
    [ "$mode" = "explain" ] && echo "REFUSE: project_id is default ('$default_project') or not set. Change project_id in supabase/config.toml or set SUPABASE_PROJECT_ID"
    return 1
  fi
  
  [ "$mode" = "explain" ] && echo "ALLOW: ALLOW_DB_RESET=1 with non-default port ($db_port) and project_id ($project_id)"
  return 0
}

# Export for sourcing
export -f check_db_reset_guard_bash 2>/dev/null || true
