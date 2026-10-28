#!/usr/bin/env bash
# Mutant test for PB toast e1RM formatting (coordinator addition)
#
# Mutant: Restore whole-kg rounding (Math.round) instead of the shared lift
# weight formatter (formatPrescribedWeight, QA2 M-1).
#
# The mutant is applied to a mktemp COPY of the repository's files; tracked
# files are never edited in place.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
BEFORE="$(git status --porcelain)"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT INT TERM

COPY="$TEMP/repo"
mkdir -p "$COPY"
git ls-files -z --cached --others --exclude-standard -- src scripts package.json tsconfig.json \
  | xargs -0 cp --parents -t "$COPY"
ln -s "$ROOT/node_modules" "$COPY/node_modules"
TSX="$ROOT/node_modules/.bin/tsx"
SRC="$COPY/src/lib/program/progression.ts"

[ ! -f "$SRC" ] && echo "✗ Source not found" && exit 1

echo "Mutant test for PB toast e1RM formatting"

if ! (cd "$COPY" && "$TSX" scripts/test-pb-toast-format.ts >/dev/null 2>&1); then
  echo "✗ Baseline failed"
  exit 1
fi
echo "✓ Baseline passed"
echo

# M1: Restore whole-kg rounding for e1rm
echo "M1: Restore whole-kg rounding (Math.round)"
cp "$SRC" "$TEMP/progression.ts.orig"
sed -i 's/return `Best estimated one-rep max yet — \${formatPrescribedWeight(pb.value, units)}`;/return `Best estimated one-rep max yet — \${Math.round(pb.value)} kg`;/' "$SRC"
cmp -s "$SRC" "$TEMP/progression.ts.orig" && echo "  ✗ M1: No change" && exit 1
set +e
OUT=$(cd "$COPY" && "$TSX" scripts/test-pb-toast-format.ts 2>&1)
CODE=$?
set -e
[ $CODE -eq 0 ] && echo "  ✗ M1: Survived" && exit 1
echo "  ✓ M1: Killed"
echo "     $(echo "$OUT" | grep "✗" | head -1)"

[ "$BEFORE" = "$(git status --porcelain)" ] || { echo "✗ Tracked files changed"; exit 1; }
echo
echo "✅ Mutant killed"
