#!/usr/bin/env bash
#
# Mutation tests for D7 rest-day prompt changes.
#
# Each mutant replaces ONE exact literal that must occur exactly once in its
# file. A mutant that does not type-check is SKIPPED. The original file is
# always restored (trap).
#
# Exit 1 on any skip or survivor.

set -u

KILLED=0
SURVIVED=0
SKIPPED=0
CURRENT_FILE=""
BACKUP=""

restore() {
  if [ -n "$CURRENT_FILE" ] && [ -n "$BACKUP" ] && [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$CURRENT_FILE"
    rm -f "$BACKUP"
  fi
  CURRENT_FILE=""
  BACKUP=""
}
trap restore EXIT INT TERM

# replace_once FILE OLD NEW -> 0 if OLD occurred exactly once and was replaced
replace_once() {
  FILE="$1" OLD="$2" NEW="$3" node -e '
    const fs = require("fs");
    const { FILE, OLD, NEW } = process.env;
    const src = fs.readFileSync(FILE, "utf8");
    const n = src.split(OLD).length - 1;
    if (n !== 1) { console.error(`  pattern occurs ${n} times`); process.exit(1); }
    fs.writeFileSync(FILE, src.replace(OLD, () => NEW));
  '
}

# run_mutant NAME FILE OLD NEW TEST...
run_mutant() {
  local name=$1 file=$2 old=$3 new=$4
  shift 4
  echo ""
  echo "$name"
  CURRENT_FILE="$file"
  BACKUP="$(mktemp)"
  cp "$file" "$BACKUP"

  if ! replace_once "$file" "$old" "$new"; then
    echo "  ⊘ SKIP: pattern not found exactly once"
    SKIPPED=$((SKIPPED + 1))
    restore
    return
  fi
  if ! npx tsc --noEmit >/dev/null 2>&1; then
    echo "  ⊘ SKIP: does not compile (must be killed by a test, not tsc)"
    SKIPPED=$((SKIPPED + 1))
    restore
    return
  fi
  local killer=""
  for t in "$@"; do
    if ! npm run -s "$t" >/dev/null 2>&1; then
      killer="$t"
      break
    fi
  done
  if [ -n "$killer" ]; then
    echo "  ✓ KILLED by $killer"
    KILLED=$((KILLED + 1))
  else
    echo "  ✗ SURVIVED ($*)"
    SURVIVED=$((SURVIVED + 1))
  fi
  restore
}

COMPONENT=src/components/day-plan-prompt.tsx
ACTION=src/app/session/actions.ts
RESOLVE=src/lib/session/resolve-plan-target-date.ts
T=test:day-plan-rest-prompt
T_RESOLVE=test:resolve-plan-target-date
T_SERVER=test:plan-day-server-wiring

echo "D7 Rest-Day Prompt Mutation Testing"
echo "──────────────────────────────────────────────────────────"

npm run -s "$T" >/dev/null 2>&1 || { echo "FATAL: baseline $T fails"; exit 1; }

run_mutant "1. Rest day detection: always false" "$COMPONENT" \
  'const isRestDay = plannedLabel.toLowerCase() === "rest";' \
  'const isRestDay = false;' "$T"

run_mutant "2. Tomorrow label detection: always false" "$COMPONENT" \
  'const isTomorrowLabel = dayLabel === "Tomorrow";' \
  'const isTomorrowLabel = false;' "$T"

run_mutant "3. Show new UI gate: always false" "$COMPONENT" \
  'const showNewRestUI = isRestDay && isTomorrowLabel;' \
  'const showNewRestUI = false;' "$T"

run_mutant "4. Rest day line text: change 'Train anyway?' to 'Rest today?'" "$COMPONENT" \
  '{dayLabel}: rest day. Train anyway?' \
  '{dayLabel}: rest day. Rest today?' "$T"

run_mutant "5. Train anyway button: change to 'Swap it'" "$COMPONENT" \
  '<Choice disabled={pending} onClick={() => setChoosing(true)}>
              Train anyway
            </Choice>' \
  '<Choice disabled={pending} onClick={() => setChoosing(true)}>
              Swap it
            </Choice>' "$T"

run_mutant "6. Keep rest button: change to 'Dismiss'" "$COMPONENT" \
  '<Choice disabled={pending} onClick={() => choose({ kind: "keep" }, "a rest day")}>
              Keep rest
            </Choice>' \
  '<Choice disabled={pending} onClick={() => choose({ kind: "keep" }, "a rest day")}>
              Dismiss
            </Choice>' "$T"

run_mutant "9. Rest day detection: case-sensitive (accept 'Rest' but not 'rest')" "$COMPONENT" \
  'const isRestDay = plannedLabel.toLowerCase() === "rest";' \
  'const isRestDay = plannedLabel === "Rest";' "$T"

run_mutant "10. Tomorrow detection: case-sensitive check is strict" "$COMPONENT" \
  'const isTomorrowLabel = dayLabel === "Tomorrow";' \
  'const isTomorrowLabel = dayLabel.toLowerCase() === "tomorrow";' "$T"

run_mutant "R1. Wrong sessionId sent to onPlan" "$COMPONENT" \
  '        const r = await onPlan(input);' \
  '        const r = await onPlan({ sessionId: "mutant-wrong-id", plan } as never);' "$T"

run_mutant "R3. Never mind persists a change (writes keep)" "$COMPONENT" \
  '            <button
              disabled={pending}
              onClick={() => setChoosing(false)}
              className="w-full py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
            >
              Never mind
            </button>
          </div>
        )}

        {error && (' \
  '            <button
              disabled={pending}
              onClick={() => choose({ kind: "keep" }, "a rest day")}
              className="w-full py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
            >
              Never mind
            </button>
          </div>
        )}

        {error && (' "$T"

run_mutant "R4. Never mind does nothing (stays choosing)" "$COMPONENT" \
  '            <button
              disabled={pending}
              onClick={() => setChoosing(false)}
              className="w-full py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
            >
              Never mind
            </button>
          </div>
        )}

        {error && (' \
  '            <button
              disabled={pending}
              onClick={() => setChoosing(true)}
              className="w-full py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
            >
              Never mind
            </button>
          </div>
        )}

        {error && (' "$T"

run_mutant "R5. Keep rest settles with wrong label" "$COMPONENT" \
  'const settledCopy = settled.toLowerCase() === "rest" || settled === "a rest day"
      ? `${dayLabel} is a rest day.`
      : `${dayLabel} is ${settled}.`;' \
  'const settledCopy = settled.toLowerCase() === "rest" || settled === "a rest day"
      ? `${dayLabel} is Upper.`
      : `${dayLabel} is ${settled}.`;' "$T"

run_mutant "R6. Keep rest not disabled while pending" "$COMPONENT" \
  '            <Choice disabled={pending} onClick={() => choose({ kind: "keep" }, "a rest day")}>
              Keep rest
            </Choice>' \
  '            <Choice disabled={false} onClick={() => choose({ kind: "keep" }, "a rest day")}>
              Keep rest
            </Choice>' "$T"

run_mutant "R6b. Training choices not disabled while pending (rest branch)" "$COMPONENT" \
  '              days.map((d) => (
                <Choice
                  key={d.programDayId}
                  wide
                  disabled={pending}
                  onClick={() =>
                    choose({ kind: "training", programDayId: d.programDayId }, d.label)
                  }
                >
                  {d.label}
                </Choice>
              ))
            )}
            {days.some' \
  '              days.map((d) => (
                <Choice
                  key={d.programDayId}
                  wide
                  disabled={false}
                  onClick={() =>
                    choose({ kind: "training", programDayId: d.programDayId }, d.label)
                  }
                >
                  {d.label}
                </Choice>
              ))
            )}
            {days.some' "$T"

run_mutant "R7. Error not shown in rest branch" "$COMPONENT" \
  '        {error && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            <p>{error}</p>
            <button
              onClick={() => {
                setError(null);
                // LOW fix: Retry actually retries the save
                if (lastAttempt) {
                  choose(lastAttempt.plan, lastAttempt.describedAs);
                }
              }}
              className="mt-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-sm text-brand underline underline-offset-2"
            >
              Retry' \
  '        {false && error && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            <p>{error}</p>
            <button
              onClick={() => {
                setError(null);
                // LOW fix: Retry actually retries the save
                if (lastAttempt) {
                  choose(lastAttempt.plan, lastAttempt.describedAs);
                }
              }}
              className="mt-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-sm text-brand underline underline-offset-2"
            >
              Retry' "$T"

run_mutant "R8. Failed plan still settles (ignore r.ok)" "$COMPONENT" \
  '        const r = await onPlan(input);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setChoosing(false);
        setSettled(describedAs);
        // Delay redirect so confirmation is visible for ~1.2s
        setTimeout(() => {
          // Today reads the override on the server, so it has to re-render.
          router.refresh();
        }, 1200);' \
  '        const r = await onPlan(input);
        if (!r.ok) {
          setError(r.error);
        }
        setChoosing(false);
        setSettled(describedAs);
        // Delay redirect so confirmation is visible for ~1.2s
        setTimeout(() => {
          // Today reads the override on the server, so it has to re-render.
          router.refresh();
        }, 1200);' "$T"

run_mutant "R11. Training choice sends wrong programDayId (rest branch)" "$COMPONENT" \
  '              days.map((d) => (
                <Choice
                  key={d.programDayId}
                  wide
                  disabled={pending}
                  onClick={() =>
                    choose({ kind: "training", programDayId: d.programDayId }, d.label)
                  }
                >
                  {d.label}
                </Choice>
              ))
            )}
            {days.some' \
  '              days.map((d) => (
                <Choice
                  key={d.programDayId}
                  wide
                  disabled={pending}
                  onClick={() =>
                    choose({ kind: "training", programDayId: days[0].programDayId }, d.label)
                  }
                >
                  {d.label}
                </Choice>
              ))
            )}
            {days.some' "$T"

run_mutant "Q1. Yoga not added when already in block" "$COMPONENT" \
  '            {days.some((d) => d.dayType === "yoga") || days.length === 0 ? null : (
              <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
                Yoga
              </Choice>
            )}' \
  '            <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
              Yoga
            </Choice>' "$T"

run_mutant "Q4. Never mind tap target too small (py-2)" "$COMPONENT" \
  '              className="w-full py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
            >
              Never mind
            </button>
          </div>
        )}

        {error && (' \
  '              className="w-full py-2 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
            >
              Never mind
            </button>
          </div>
        )}

        {error && (' "$T"



run_mutant "N5. planDay ignores resolved date (uses today instead)" "src/lib/session/plan-day-core.ts" \
  '      local_date: input.localDate,' \
  '      local_date: input.today,' "$T_SERVER"


run_mutant "N10. SessionRunner passes localDate instead of sessionId" "$COMPONENT" \
  '        // Type-safe construction without cast
        const input = sessionId 
          ? { sessionId, plan }
          : localDate
          ? { localDate, plan }
          : { plan } as never;' \
  '        // Type-safe construction without cast
        const input = localDate 
          ? { localDate, plan }
          : sessionId
          ? { sessionId, plan }
          : { plan } as never;' "$T"

run_mutant "M-A1. page.tsx omits sessionTargetDate (MED-A)" "src/app/session/[id]/page.tsx" \
  'const tomorrow = await nextDayPlan(supabase, timezone, sessionTargetDate);' \
  'const tomorrow = await nextDayPlan(supabase, timezone);' "npm run test:med-a-server-label"

run_mutant "M-A2. nextDayPlan ignores targetLocalDate parameter (MED-A)" "src/lib/program/day-plan.ts" \
  'const tomorrow = targetLocalDate ?? sessionPlanTargetDate(localDateString(timezone));' \
  'const tomorrow = sessionPlanTargetDate(localDateString(timezone));' "npm run test:med-a-server-label"

run_mutant "M-A3. sessionPlanTargetDate adds 0 days instead of 1 (MED-A)" "src/lib/session/resolve-plan-target-date.ts" \
  'export function sessionPlanTargetDate(sessionLocalDate: string): string {
  return addDays(sessionLocalDate, 1);
}' \
  'export function sessionPlanTargetDate(sessionLocalDate: string): string {
  return addDays(sessionLocalDate, 0);
}' "npm run test:med-a-server-label"

echo ""
echo "──────────────────────────────────────────────────────────"
echo "Mutants killed:   $KILLED"
echo "Mutants survived: $SURVIVED"
echo "Mutants skipped:  $SKIPPED"
echo ""

if [ $SURVIVED -gt 0 ] || [ $SKIPPED -gt 0 ]; then
  echo "❌ FAILED: $SURVIVED survived, $SKIPPED skipped"
  exit 1
fi
echo "✅ PASSED: All mutants killed"

run_mutant "N4. Raw DB error passes through to user" "$ACTION" \
  'export function friendlyPlanDayError(error: string): string {
  return error === "That day has already been trained."
    ? error
    : error === "That day has a session in progress."
    ? error
    : error === "That day has already been and gone."
    ? error
    : error === "No active program found."
    ? error
    : "Couldn'"'"'t save your choice. Please try again.";
}' \
  'export function friendlyPlanDayError(error: string): string {
  return error;
}' "$T_SERVER"
