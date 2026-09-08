#!/usr/bin/env bash
# Start the dev server on the Node version pinned in .nvmrc.
#
# Turbopack spawns child node processes (PostCSS, loaders) that resolve `node`
# from PATH, so it is not enough for the parent process to be on the right
# version -- PATH itself has to point at it.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use >/dev/null
fi

exec npx next dev "$@"
