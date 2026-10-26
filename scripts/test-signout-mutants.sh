#!/bin/bash
set -e

echo "=== Testing Sign-Out Component Mutants ==="
echo ""

# Test both SignOutButton and SignOutForm
COMPONENTS=("signout-button" "signout-form")

for COMP in "${COMPONENTS[@]}"; do
  echo "Testing ${COMP}..."
  echo ""
  
  if [ "$COMP" = "signout-button" ]; then
    FILE="src/app/settings/signout-button.tsx"
    TEST="test:signout-button-clear"
  else
    FILE="src/app/today/signout-form.tsx"
    TEST="test:today-signout-clears"
  fi
  
  # Mutant 1: Clear queue on expired session path
  echo "Mutant 1: Clear queue on expired session 'Sign out anyway' path"
  TMPFILE=$(mktemp)
  cp "$FILE" "$TMPFILE"
  
  # Find the line with SESSION_EXPIRED and add queue clear after it
  LINE_NUM=$(grep -n "SESSION_EXPIRED" "$FILE" | head -1 | cut -d: -f1)
  if [ -n "$LINE_NUM" ]; then
    awk -v line="$LINE_NUM" '
      NR==line+2 { print; print "        // MUTANT: Clear queue"; print "        if (typeof window !== \"undefined\") { window.localStorage.removeItem(\"pending-sets:\" + userId); }"; next }
      { print }
    ' "$FILE" > /tmp/mutant-file.tsx
    mv /tmp/mutant-file.tsx "$FILE"
    
    if flock /tmp/abhyas-npmtest.lock npm run "$TEST" > /tmp/mutant1-${COMP}.txt 2>&1; then
      echo "  ❌ MUTANT 1 SURVIVED"
      tail -20 /tmp/mutant1-${COMP}.txt
      cp "$TMPFILE" "$FILE"
      rm "$TMPFILE"
      exit 1
    else
      echo "  ✓ MUTANT 1 KILLED"
      grep "queue kept" /tmp/mutant1-${COMP}.txt | head -1 || echo "  (queue assertion failed)"
    fi
  fi
  
  cp "$TMPFILE" "$FILE"
  rm "$TMPFILE"
  echo ""
  
  # Mutant 2: Skip /auth/signout POST
  echo "Mutant 2: Skip /auth/signout POST on expired session"
  TMPFILE=$(mktemp)
  cp "$FILE" "$TMPFILE"
  
  # Comment out the fetch call
  sed -i 's/const res = await fetch/\/\/ MUTANT: Skip POST\n          const res = { ok: true }; \/\/ await fetch/' "$FILE"
  
  if flock /tmp/abhyas-npmtest.lock npm run "$TEST" > /tmp/mutant2-${COMP}.txt 2>&1; then
    echo "  ❌ MUTANT 2 SURVIVED"
    tail -20 /tmp/mutant2-${COMP}.txt
    cp "$TMPFILE" "$FILE"
    rm "$TMPFILE"
    exit 1
  else
    echo "  ✓ MUTANT 2 KILLED"
    grep "POST was made\|fetchCalled" /tmp/mutant2-${COMP}.txt | head -1 || echo "  (POST assertion failed)"
  fi
  
  cp "$TMPFILE" "$FILE"
  rm "$TMPFILE"
  echo ""
  
  # Mutant 3: Clear queue on non-expired throw
  echo "Mutant 3: Clear queue on non-expired throw"
  TMPFILE=$(mktemp)
  cp "$FILE" "$TMPFILE"
  
  # Find the setError line in the catch block (not SESSION_EXPIRED path)
  sed -i '/setError("Unable to sign out/i\      // MUTANT: Clear queue on throw\n      if (typeof window !== "undefined") { window.localStorage.removeItem("pending-sets:" + userId); }' "$FILE"
  
  if flock /tmp/abhyas-npmtest.lock npm run "$TEST" > /tmp/mutant3-${COMP}.txt 2>&1; then
    echo "  ❌ MUTANT 3 SURVIVED"
    tail -20 /tmp/mutant3-${COMP}.txt
    cp "$TMPFILE" "$FILE"
    rm "$TMPFILE"
    exit 1
  else
    echo "  ✓ MUTANT 3 KILLED"
    grep "queue kept.*throw" /tmp/mutant3-${COMP}.txt | head -1 || echo "  (throw queue assertion failed)"
  fi
  
  cp "$TMPFILE" "$FILE"
  rm "$TMPFILE"
  echo ""
  
  # Mutant 4: Clear queue on ok:false
  echo "Mutant 4: Clear queue on ok:false result"
  TMPFILE=$(mktemp)
  cp "$FILE" "$TMPFILE"
  
  # Find the !result.ok check and add queue clear
  sed -i '/if (!result\.ok) {/a\      // MUTANT: Clear queue on ok:false\n      if (typeof window !== "undefined") { window.localStorage.removeItem("pending-sets:" + userId); }' "$FILE"
  
  if flock /tmp/abhyas-npmtest.lock npm run "$TEST" > /tmp/mutant4-${COMP}.txt 2>&1; then
    echo "  ❌ MUTANT 4 SURVIVED"
    tail -20 /tmp/mutant4-${COMP}.txt
    cp "$TMPFILE" "$FILE"
    rm "$TMPFILE"
    exit 1
  else
    echo "  ✓ MUTANT 4 KILLED"
    grep "queue kept.*ok:false" /tmp/mutant4-${COMP}.txt | head -1 || echo "  (ok:false queue assertion failed)"
  fi
  
  cp "$TMPFILE" "$FILE"
  rm "$TMPFILE"
  echo ""
  
  echo "✅ All mutants killed for ${COMP}"
  echo ""
done

echo "✅ All sign-out component mutants killed"
exit 0
