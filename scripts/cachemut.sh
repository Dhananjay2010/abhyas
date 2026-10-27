#!/bin/bash
# cache mutants on src/lib/gym-brand.ts; restore from mktemp; run PR unit tests + harness
cd /workspace
F=src/lib/gym-brand.ts; B=$(mktemp); cp $F $B; trap 'cp $B $F; rm -f $B' EXIT
run(){ local name="$1" from="$2" to="$3"; cp $B $F
  python3 - "$F" "$from" "$to" <<'PY'
import sys; p,a,b=sys.argv[1:]; s=open(p).read(); n=s.count(a)
if n!=1: print("ANCHOR x",n); sys.exit(3)
open(p,'w').write(s.replace(a,b))
PY
  [ $? -ne 0 ] && { echo "$name: BAD ANCHOR"; return; }
  pr="survived"; for t in test:gym-brand-unit test:gym-brand-error-cache; do npm run -s $t >/dev/null 2>&1 || pr="KILLED by $t"; done
  echo "$name | PR suite: $pr"
}
echo "baseline PR: $(npm run -s test:gym-brand-unit >/dev/null 2>&1 && npm run -s test:gym-brand-error-cache >/dev/null 2>&1 && echo pass || echo FAIL)"
run "C1 revalidate:false restored" "revalidate: 600, // 10 minutes" "revalidate: false,"
run "C2 error cached (return {} instead of throw)" 'throw new Error(`Failed to get gym brand: ${error.message}`);' 'return {};'
run "C3 gym id dropped from cache key" '[`gym-brand-${gymId}`]' '["gym-brand"]'
run "C4 gym id dropped from tag" 'tags: [gymBrandTag(gymId)],' 'tags: ["gym-brand"],'
run "C5 outer catch rethrows (raw error to caller)" "    return neutralBrand;" "    throw error;"
