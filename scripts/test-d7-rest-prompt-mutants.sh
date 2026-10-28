#!/usr/bin/env bash
#
# Mutation tests for D7 rest-day prompt changes.
#
# Each mutant replaces ONE exact literal that must occur exactly once in its
# file. A mutant that does not type-check is SKIPPED. The original file is
# always restored (trap).
#
# APP rule: no script in the `npm test` chain may modify tracked files. All
# mutants are applied to a scratch copy of the checkout in a mktemp dir
# (node_modules symlinked), and every test runs there; the checkout itself is
# never written. The script fails if the checkout's status changed.
#
# A mutant counts as KILLED only when a test exits non-zero AND prints an
# assertion failure line ("✗ FAIL" / "❌ FAIL") AND did not crash (no
# "CRASH", "✗ ERROR", "Missing script", "Cannot find module", SyntaxError).
# Every test name must be a real package.json script, checked up front.
#
# Exit 1 on any skip or survivor.

set -u

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STATUS_BEFORE="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | sha256sum)"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/d7-mutants.XXXXXX")"
cleanup_scratch() {
  case "$SCRATCH" in
    "${TMPDIR:-/tmp}"/d7-mutants.*) rm -rf "$SCRATCH" ;;
  esac
}
# Tracked + untracked (not ignored) files, as they are in the working tree.
( cd "$REPO_ROOT" && git ls-files -z --cached --others --exclude-standard ) \
  | ( cd "$REPO_ROOT" && tar --null --ignore-failed-read -T - -cf - 2>/dev/null ) \
  | tar -xf - -C "$SCRATCH"
[ -e "$SCRATCH/node_modules" ] || ln -s "$REPO_ROOT/node_modules" "$SCRATCH/node_modules"
cd "$SCRATCH" || exit 1
echo "Mutating a scratch copy: $SCRATCH (checkout untouched: $REPO_ROOT)"

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
trap 'restore; cleanup_scratch' EXIT
# MED-3: Handle Ctrl-C/SIGINT - abort whole script
trap 'restore; cleanup_scratch; exit 130' INT TERM

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
T_NEXT=test:next-up-after-session-wiring
T_PINS=test:day-plan-prompt-pins
ALL_TESTS="$T $T_RESOLVE $T_SERVER $T_MED_A $T_FETCH $T_ERROR $T_ACTION $T_PAGE $T_RUNNER $T_NEXT $T_PINS"

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
  'const isRestDay = shownPlanned.toLowerCase() === "rest";' \
  'const isRestDay = false;' "$T"

run_mutant "2. Tomorrow label detection: always false" "$COMPONENT" \
  'const isTomorrowLabel = dayLabel === "Tomorrow";' \
  'const isTomorrowLabel = false;' "$T"

run_mutant "3. Show new UI gate: always false" "$COMPONENT" \
  'const showNewRestUI = isRestDay && isTomorrowLabel;' \
  'const showNewRestUI = false;' "$T"

run_mutant "4. Rest day line text: change 'Train anyway?' to 'Rest today?'" "$COMPONENT" \
  '{shownLabel}: rest day. Train anyway?' \
  '{shownLabel}: rest day. Rest today?' "$T"

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
  'const isRestDay = shownPlanned.toLowerCase() === "rest";' \
  'const isRestDay = shownPlanned === "Rest";' "$T"

run_mutant "10. Tomorrow detection: case-sensitive check is strict" "$COMPONENT" \
  'const isTomorrowLabel = dayLabel === "Tomorrow";' \
  'const isTomorrowLabel = dayLabel.toLowerCase() === "tomorrow";' "$T"

run_mutant "R1. Wrong sessionId sent to onPlan" "$COMPONENT" \
  '        const r = await onPlan(input);' \
  '        const r = await onPlan({ sessionId: "mutant-wrong-id", plan } as never);' "$T"

run_mutant "R3. Never mind persists a change (writes keep)" "$COMPONENT" \
  '            {shownDays.some((d) => d.dayType === "yoga") || shownDays.length === 0 ? null : (
              <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
                Yoga
              </Choice>
            )}
            <button
              disabled={pending}
              onClick={() => setChoosing(false)}
              className="w-full min-h-11 py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
            >
              Never mind
            </button>
          </div>
        )}' \
  '            {shownDays.some((d) => d.dayType === "yoga") || shownDays.length === 0 ? null : (
              <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
                Yoga
              </Choice>
            )}
            <button
              disabled={pending}
              onClick={() => choose({ kind: "keep" }, "a rest day")}
              className="w-full min-h-11 py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
            >
              Never mind
            </button>
          </div>
        )}' "$T"

run_mutant "R4. Never mind does nothing (stays choosing)" "$COMPONENT" \
  '            {shownDays.some((d) => d.dayType === "yoga") || shownDays.length === 0 ? null : (
              <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
                Yoga
              </Choice>
            )}
            <button
              disabled={pending}
              onClick={() => setChoosing(false)}
              className="w-full min-h-11 py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
            >
              Never mind
            </button>' \
  '            {shownDays.some((d) => d.dayType === "yoga") || shownDays.length === 0 ? null : (
              <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
                Yoga
              </Choice>
            )}
            <button
              disabled={pending}
              onClick={() => {}}
              className="w-full min-h-11 py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
            >
              Never mind
            </button>' "$T"

run_mutant "R5. Keep rest settles with wrong label" "$COMPONENT" \
  '    // MED-C: Use dayLabel (context-dependent) instead of hardcoding "Tomorrow"
    const settledCopy = settled.toLowerCase() === "rest" || settled === "a rest day"
      ? `${shownLabel} is a rest day.`
      : `${shownLabel} is ${settled}.`;' \
  '    // MED-C: Use dayLabel (context-dependent) instead of hardcoding "Tomorrow"
    const settledCopy = settled.toLowerCase() === "rest" || settled === "a rest day"
      ? `${shownLabel} is Upper.`
      : `${shownLabel} is ${settled}.`;' "$T"

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
  '          setError(r.error);
          return;
        }
        setChoosing(false);
        setSettled(describedAs);' \
  '          setError(r.error);
        }
        setChoosing(false);
        setSettled(describedAs);' "$T"

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
  '            {shownDays.some((d) => d.dayType === "yoga") || shownDays.length === 0 ? null : (
              <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
                Yoga
              </Choice>
            )}' \
  '            <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
              Yoga
            </Choice>' "$T"

run_mutant "Q4. Never mind tap target too small (py-2)" "$COMPONENT" \
  '            {shownDays.some((d) => d.dayType === "yoga") || shownDays.length === 0 ? null : (
              <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
                Yoga
              </Choice>
            )}
            <button
              disabled={pending}
              onClick={() => setChoosing(false)}
              className="w-full min-h-11 py-3 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
            >
              Never mind
            </button>' \
  '            {shownDays.some((d) => d.dayType === "yoga") || shownDays.length === 0 ? null : (
              <Choice wide disabled={pending} onClick={() => choose({ kind: "yoga" }, "yoga")}>
                Yoga
              </Choice>
            )}
            <button
              disabled={pending}
              onClick={() => setChoosing(false)}
              className="w-full py-2 text-sm text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
            >
              Never mind
            </button>' "$T"

# MED-2 behavioural tests: the REAL planDay action (test-plan-day-action-wiring)
run_mutant "MED-2a. planDay saves to today instead of resolved date" "$ACTION" \
  '  const result = await planDayCore(client, {
    userId: user.id,
    localDate: targetDate,
    today,
    plan: input.plan,' \
  '  const result = await planDayCore(client, {
    userId: user.id,
    localDate: input.localDate ?? today,
    today,
    plan: input.plan,' "$T_ACTION"

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
          ? { sessionId, plan, ...(shownDay ? { shownDate: shownDay } : {}) }
          : { localDate: localDate!, plan };' \
  '        const input = localDate 
          ? { localDate, plan }
          : { sessionId: sessionId!, plan, ...(shownDay ? { shownDate: shownDay } : {}) };' "$T"

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

# ── r5: QA1 MED-1 / MED-B (Next up after this session), LOW-1, LOW-2 ──

run_mutant "NU1. Old in-progress computation: Next up ignores the session being finished" "$DAYPLAN" \
  '        justDone: await loadCurrentSession(),' \
  '        justDone: null,' "$T_NEXT"

run_mutant "NU2. Next-up badge matched by id on the label-deduped list" "$DAYPLAN" \
  '      nextUp: label === nextUpLabel' \
  '      nextUp: d.id === nextUpLabel' "$T_NEXT"

run_mutant "NU3. A just-done session that is not a program day still counts" "$DAYPLAN" \
  '    justDone.programDayId !== null &&' \
  '    true &&' "$T_NEXT"

run_mutant "NU-S1. Surface 1 (rest list) unsorted: Next up not first" "$COMPONENT" \
  '              sortedDays.map((d) => (' \
  '              days.map((d) => (' "$T_NEXT"

run_mutant "NU-S2. Surface 2 (summary swap list) unsorted: Next up not first" "$COMPONENT" \
  '          {sortedDays.map((d) => (' \
  '          {days.map((d) => (' "$T_NEXT"

run_mutant "NU-S2b. Surface 2 (summary swap list) drops the Next-up badge" "$COMPONENT" \
  '                <span>{d.label}</span>
                {d.nextUp && (' \
  '                <span>{d.label}</span>
                {false && d.nextUp && (' "$T_NEXT"

run_mutant "LBL1. page.tsx always labels the target day Tomorrow" "$PAGE" \
  '    ? planTargetLabel(sessionTargetDate, localDateString(timezone))' \
  '    ? "Tomorrow"' "$T_NEXT"

run_mutant "LBL2. Runner drops the label the page computed from the prompt copy" "$RUNNER" \
  '            displayLabel={tomorrowLabel}' \
  '            displayLabel={undefined}' "$T_NEXT"

run_mutant "LBL3. Runner keeps the hardcoded 'What about tomorrow?' heading" "$RUNNER" \
  '            heading={planPromptHeading(tomorrowLabel)}' \
  '            heading={planPromptHeading("Tomorrow")}' "$T_NEXT"

run_mutant "LBL4. Prompt ignores displayLabel" "$COMPONENT" \
  '  const shownLabel = retarget?.label ?? displayLabel ?? dayLabel;' \
  '  const shownLabel = retarget?.label ?? dayLabel;' "$T_NEXT"

run_mutant "CF1. planDay revalidates from the summary (redirect ~100ms after the tap)" "$ACTION" \
  '  if (!input.sessionId) revalidateTrainingData();' \
  '  revalidateTrainingData();' "$T_ACTION"

run_mutant "CF2. Summary leaves for Today immediately (no hold)" "$COMPONENT" \
  '          }, SESSION_CONFIRM_MS);' \
  '          }, 0);' "$T_NEXT"

run_mutant "CF3. Summary only router.refresh()es (Today never revalidated)" "$COMPONENT" \
  '            void Promise.resolve().then(onRefresh).catch(() => {});' \
  '            router.refresh();' "$T_NEXT"

run_mutant "CF4. Change it does not cancel the pending refresh" "$COMPONENT" \
  '            if (leaveTimer.current) clearTimeout(leaveTimer.current);
            leaveTimer.current = null;
            setSettled(null);' \
  '            setSettled(null);' "$T_NEXT"

# ── r5: QA3 r4 LOWs (page open across midnight, no-Retry list, pins X1/X2/X4–X6/X8) ──

run_mutant "MID1. Server ignores the shown day (MED-4 re-run at tap time: shows 28, saves 30)" "$RESOLVE" \
  '    if (input.shownDate !== undefined) {' \
  '    if (input.shownDate !== undefined && input.userId.length < 0) {' "$T_ACTION"

run_mutant "MID2. Server accepts any shown day" "$RESOLVE" \
  '  return todayOrTomorrow && shownDate > sessionLocalDate;' \
  '  return true;' "$T_ACTION"

run_mutant "MID3. Server accepts the session's own day" "$RESOLVE" \
  '  return todayOrTomorrow && shownDate > sessionLocalDate;' \
  '  return todayOrTomorrow;' "$T_ACTION"

run_mutant "MID4. Runner does not send the day it showed" "$RUNNER" \
  '            shownDate={tomorrow.localDate}' \
  '            shownDate={undefined}' "$T_NEXT"

run_mutant "MID5. planDay drops the new day (no retarget)" "$ACTION" \
  '    if (targetResult.retarget && input.sessionId) {' \
  '    if (targetResult.retarget && input.sessionId && input.sessionId.length < 0) {' "$T_ACTION"

run_mutant "MID6. Prompt ignores the new day the server sent" "$COMPONENT" \
  '            setRetarget(r.retarget);' \
  '            void r.retarget;' "$T_PINS"

run_mutant "NR1. Retry offered after 'Session not found.'" "$COMPONENT" \
  '    // QA3 LOW-6: retrying cannot bring a missing session back.
    "Session not found.",' \
  '    // QA3 LOW-6: retrying cannot bring a missing session back.' "$T_PINS"

run_mutant "X1. Allowlist matches by substring" "$FRIENDLY" \
  '  if ((CORE_FRIENDLY_ERRORS as readonly string[]).includes(error)) {' \
  '  if ((CORE_FRIENDLY_ERRORS as readonly string[]).some((m) => error.includes(m))) {' "$T_ERROR"

run_mutant "X2. Page MED-4 date check uses UTC instead of the profile timezone" "$PAGE" \
  '    ? planTargetDate(session.local_date, localDateString(timezone))' \
  '    ? planTargetDate(session.local_date, localDateString("UTC"))' "$T_NEXT"

run_mutant "X4. 'That day has already been and gone.' made retryable" "$COMPONENT" \
  '    "That day has already been and gone.",
    "That session has already started.",' \
  '    "That session has already started.",' "$T_PINS"

run_mutant "X5. Settled rest copy hard-codes Tomorrow" "$COMPONENT" \
  '      ? `${shownLabel} is a rest day.`' \
  '      ? `Tomorrow is a rest day.`' "$T_PINS"

run_mutant "X6. Retry only dismisses (Today page / non-rest branch)" "$COMPONENT" \
  '                if (lastAttempt) {
                  choose(lastAttempt.plan, lastAttempt.describedAs);
                }' \
  '                if (lastAttempt) {
                  void lastAttempt;
                }' "$T_PINS"

run_mutant "X8. Today path writes today instead of input.localDate" "$ACTION" \
  '      : { userId: user.id, localDate: input.localDate as string },' \
  '      : { userId: user.id, localDate: today },' "$T_ACTION"

echo ""
echo "──────────────────────────────────────────────────────────"
echo "Mutants killed:   $KILLED"
echo "Mutants survived: $SURVIVED"
echo "Mutants skipped:  $SKIPPED"
echo ""

# APP rule: the checkout must be exactly as it was.
if [ "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | sha256sum)" != "$STATUS_BEFORE" ]; then
  echo "❌ FAILED: the checkout's tracked files changed during the run"
  exit 1
fi

if [ $SURVIVED -gt 0 ] || [ $SKIPPED -gt 0 ]; then
  echo "❌ FAILED: $SURVIVED survived, $SKIPPED skipped"
  exit 1
fi
echo "✅ PASSED: All mutants killed"
