#!/usr/bin/env bash
#
# Mutation tests for D7 rest-day prompt changes.
#
# Each mutant replaces ONE exact literal that must occur exactly once in its
# file. A mutant that does not type-check is SKIPPED. The original file is
# always restored (trap).
#
# A mutant counts as KILLED only when a test exits non-zero AND prints an
# assertion failure line ("✗ FAIL" / "❌ FAIL") AND did not crash (no
# "CRASH", "✗ ERROR", "Missing script", "Cannot find module", SyntaxError).
# Every test name must be a real package.json script, checked up front.
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
trap restore EXIT
# MED-3: Handle Ctrl-C/SIGINT - abort whole script
trap 'restore; exit 130' INT TERM

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
  
  # MED-3: Count kill only when test exits non-zero with assertion FAIL
  local killer=""
  for t in "$@"; do
    local output
    output=$(npm run -s "$t" 2>&1)
    local exit_code=$?
    
    # Only count as kill if:
    # - Test exited non-zero
    # - Output contains "FAIL" or "✗" (assertion failure markers)
    # - NOT a "Missing script" or crash error
    if [ $exit_code -ne 0 ]; then
      if echo "$output" | grep -qE "(✗ FAIL|❌ FAIL)"; then
        # A crash is not a kill, even if an earlier assertion printed FAIL.
        if ! echo "$output" | grep -qE "(CRASH|✗ ERROR|Missing script|Cannot find module|SyntaxError|ReferenceError)"; then
          killer="$t"
          break
        fi
      fi
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
T_MED_A=test:med-a-server-label
T_FETCH=test:fetch-session-local-date
T_ERROR=test:plan-day-error-mapping
T_ACTION=test:plan-day-action-wiring
T_PAGE=test:session-page-tomorrow-wiring
T_RUNNER=test:session-runner-plan-day-wiring
RUNNER="src/app/session/[id]/session-runner.tsx"
PAGE="src/app/session/[id]/page.tsx"
DAYPLAN=src/lib/program/day-plan.ts
FRIENDLY=src/lib/session/friendly-plan-day-error.ts
ALL_TESTS="$T $T_RESOLVE $T_SERVER $T_MED_A $T_FETCH $T_ERROR $T_ACTION $T_PAGE $T_RUNNER"

# MED-3: every test name must be a real npm script (no "npm run npm run ...")
for test in $ALL_TESTS; do
  if ! node -e 'process.exit(require("./package.json").scripts[process.argv[1]] ? 0 : 1)' "$test"; then
    echo "FATAL: '$test' is not a script in package.json"
    exit 1
  fi
done

echo "D7 Rest-Day Prompt Mutation Testing"
echo "──────────────────────────────────────────────────────────"

# MED-3: Run every target test on CLEAN code first, exit 1 if any baseline fails
echo "Baseline checks..."
for test in $ALL_TESTS; do
  npm run -s "$test" >/dev/null 2>&1
  rc=$?
  if [ $rc -ne 0 ]; then
    echo "FATAL: baseline $test fails (exit code $rc)"
    exit 1
  fi
done
echo "All baselines pass"
echo ""

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
  '              sortedDays.map((d) => (
                <Choice
                  key={d.programDayId}
                  wide
                  disabled={pending}
                  onClick={() =>
                    choose({ kind: "training", programDayId: d.programDayId }, d.label)
                  }
                >
                  <div className="flex items-center justify-between">
                    <span>{d.label}</span>' \
  '              sortedDays.map((d) => (
                <Choice
                  key={d.programDayId}
                  wide
                  disabled={false}
                  onClick={() =>
                    choose({ kind: "training", programDayId: d.programDayId }, d.label)
                  }
                >
                  <div className="flex items-center justify-between">
                    <span>{d.label}</span>' "$T"

run_mutant "R7. Error not shown in rest branch" "$COMPONENT" \
  '        {error && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            <p>{error}</p>' \
  '        {false && error && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            <p>{error}</p>' "$T"

run_mutant "R7b. Error not shown in non-rest branch" "$COMPONENT" \
  '      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          <p>{error}</p>
          {isRetryable && (
            <button
              onClick={() => {
                setError(null);
                if (lastAttempt) {
                  choose(lastAttempt.plan, lastAttempt.describedAs);
                }
              }}
              className="mt-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-sm text-brand underline underline-offset-2"
            >
              Retry
            </button>
          )}
        </div>
      )}' \
  '      {false && error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          <p>{error}</p>
          {isRetryable && (
            <button
              onClick={() => {
                setError(null);
                if (lastAttempt) {
                  choose(lastAttempt.plan, lastAttempt.describedAs);
                }
              }}
              className="mt-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-sm text-brand underline underline-offset-2"
            >
              Retry
            </button>
          )}
        </div>
      )}' "$T"

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
  '              sortedDays.map((d) => (
                <Choice
                  key={d.programDayId}
                  wide
                  disabled={pending}
                  onClick={() =>
                    choose({ kind: "training", programDayId: d.programDayId }, d.label)
                  }
                >
                  <div className="flex items-center justify-between">
                    <span>{d.label}</span>' \
  '              sortedDays.map((d) => (
                <Choice
                  key={d.programDayId}
                  wide
                  disabled={pending}
                  onClick={() =>
                    choose({ kind: "training", programDayId: days[0].programDayId }, d.label)
                  }
                >
                  <div className="flex items-center justify-between">
                    <span>{d.label}</span>' "$T"

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

# MED-2 behavioural tests: the REAL planDay action (test-plan-day-action-wiring)
run_mutant "MED-2a. planDay saves to today instead of resolved date" "$ACTION" \
  '  const result = await planDayCore(client, {
    userId: user.id,
    localDate: targetDate,
    today,' \
  '  const result = await planDayCore(client, {
    userId: user.id,
    localDate: input.localDate ?? today,
    today,' "$T_ACTION"

run_mutant "MED-2b. Raw error passes through (no friendlyPlanDayError)" "$ACTION" \
  '    return { ok: false, error: friendlyPlanDayError(result.error) };' \
  '    return { ok: false, error: result.error };' "$T_ACTION"

run_mutant "MED-2c. Failed session lookup falls back to today" "$RESOLVE" \
  '    if (result.error) {
      return { ok: false, error: "Could not load session." };
    }' \
  '    if (result.error) {
      return { ok: true, data: userLocalToday };
    }' "$T_ACTION"

run_mutant "MED-2c2. Failed session lookup returns the raw lookup error" "$RESOLVE" \
  '      return { ok: false, error: "Could not load session." };' \
  '      return { ok: false, error: result.error };' "$T_ACTION"

run_mutant "MED-2e. No-target guard removed (LOW-9)" "$ACTION" \
  '  if (!input.sessionId && !input.localDate) {
    return { ok: false, error: GENERIC_PLAN_DAY_ERROR };
  }' \
  '  if (false && !input.sessionId && !input.localDate) {
    return { ok: false, error: GENERIC_PLAN_DAY_ERROR };
  }' "$T_ACTION"

run_mutant "MED-1. Allowlist reverted to a deny-list" "$FRIENDLY" \
  '  if ((CORE_FRIENDLY_ERRORS as readonly string[]).includes(error)) {
    return error;
  }
  return GENERIC_PLAN_DAY_ERROR;' \
  '  if (/constraint|duplicate|unique/i.test(error)) {
    return GENERIC_PLAN_DAY_ERROR;
  }
  return error;' "$T_ACTION" "$T_ERROR"

run_mutant "MED-1b. Real core copy missing from allowlist" "$FRIENDLY" \
  '  "That day is not in your block.",' \
  '  "That day isn'"'"'t in your block.",' "$T_ACTION" "$T_ERROR"

run_mutant "MED-2d. Component prefers localDate over sessionId" "$COMPONENT" \
  '        const input = sessionId 
          ? { sessionId, plan }
          : { localDate: localDate!, plan };' \
  '        const input = localDate 
          ? { localDate, plan }
          : { sessionId: sessionId!, plan };' "$T"

# QA3 r3 Q4: the REAL runner must pass sessionId, not tomorrow.localDate
run_mutant "RUN1. Session-runner passes localDate instead of sessionId" "$RUNNER" \
  '            sessionId={sessionId}
            dayLabel="Tomorrow"' \
  '            localDate={tomorrow.localDate}
            dayLabel="Tomorrow"' "$T_RUNNER"

run_mutant "MED-4. Stale-session fallback removed (always session.local_date + 1)" "$RESOLVE" \
  '  return candidate >= userLocalToday ? candidate : addDays(userLocalToday, 1);' \
  '  return candidate;' "$T_RESOLVE" "$T_ACTION" "$T_PAGE"

# MED-A / MED-4 on the page, by behaviour (QA3 r3 Q5/Q6, replaces source scans)
run_mutant "PG1. page.tsx shows session.local_date + 1 without the MED-4 clamp" "$PAGE" \
  '    ? planTargetDate(session.local_date, localDateString(timezone))' \
  '    ? planTargetDate(session.local_date, "0000-01-01")' "$T_PAGE"

run_mutant "PG2. page.tsx omits sessionTargetDate (wall-clock tomorrow)" "$PAGE" \
  'const tomorrow = await nextDayPlan(supabase, timezone, sessionTargetDate, {' \
  'const tomorrow = await nextDayPlan(supabase, timezone, sessionTargetDate && undefined, {' "$T_PAGE"

run_mutant "SID1. page.tsx drops sessionId from nextDayPlan (#165 swap check)" "$PAGE" \
  '  const tomorrow = await nextDayPlan(supabase, timezone, sessionTargetDate, {
    sessionId: session.id,
  });' \
  '  const tomorrow = await nextDayPlan(supabase, timezone, sessionTargetDate, {});' "$T_PAGE"

run_mutant "DP1. nextDayPlan ignores targetLocalDate (wall-clock tomorrow)" "$DAYPLAN" \
  '  const today = targetLocalDate ? addDays(targetLocalDate, -1) : localDateString(timezone, wallClockNow);
  const tomorrow = targetLocalDate ?? addDays(today, 1);' \
  '  const today = localDateString(timezone, wallClockNow);
  const tomorrow = addDays(today, 1);' "$T_PAGE"

# #165 obligations in the Tomorrow+rest branch
run_mutant "NX1. Rest branch lists days unsorted (no Next-up first)" "$COMPONENT" \
  '              sortedDays.map((d) => (
                <Choice
                  key={d.programDayId}
                  wide
                  disabled={pending}
                  onClick={() =>
                    choose({ kind: "training", programDayId: d.programDayId }, d.label)
                  }
                >
                  <div className="flex items-center justify-between">
                    <span>{d.label}</span>' \
  '              days.map((d) => (
                <Choice
                  key={d.programDayId}
                  wide
                  disabled={pending}
                  onClick={() =>
                    choose({ kind: "training", programDayId: d.programDayId }, d.label)
                  }
                >
                  <div className="flex items-center justify-between">
                    <span>{d.label}</span>' "$T"

run_mutant "NX2. Rest branch drops the Next-up badge" "$COMPONENT" \
  '                    <span>{d.label}</span>
                    {d.nextUp && (
                      <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
                        Next up
                      </span>
                    )}' \
  '                    <span>{d.label}</span>
                    {false && d.nextUp && (
                      <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
                        Next up
                      </span>
                    )}' "$T"

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
