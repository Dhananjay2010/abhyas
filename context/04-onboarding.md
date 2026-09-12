# 04 — Onboarding flow

## What this delivers

The nine-step signup flow that collects everything the block generator needs,
and builds the user's first training block at the end.

## Steps

Per `SPEC.md` section 5, in order:

1. Disclaimer (explicit accept, timestamped; minimum age 16)
2. About you — date of birth, sex, height, weight
3. Goal
4. Level
5. Track — gym, or home (bodyweight / yoga / breathing)
6. Days per week (3–6)
7. Yoga mix
8. Equipment checklist
9. Injuries

Steps 7 and 8 are **skipped** for a yoga- or breathing-led plan, making that
branch seven steps instead of nine.

## Files

| File | Role |
|---|---|
| `src/app/onboarding/page.tsx` | Server component; loads state, redirects if already onboarded |
| `src/app/onboarding/onboarding-flow.tsx` | The wizard (client) |
| `src/app/onboarding/actions.ts` | Server actions, one per step |
| `src/lib/onboarding/options.ts` | Option data, labels, `ageOn()`, `MIN_AGE_YEARS` |
| `src/components/ui.tsx` | `StepShell`, `OptionCard`, `PrimaryButton`, `Field`, `ErrorNote` |
| `src/app/dev/onboarding/*` | Development-only preview harness |

## Decisions and why

### Each step persists before it advances

`advance()` only moves forward if the server action returned `ok`. A
half-finished signup therefore resumes where it left off: `initialStepIndex()`
walks the saved profile and returns the first incomplete step.

Resume granularity is the first six steps (the required profile fields). Yoga
mix, equipment and injuries are quick to redo and are not individually
resumable.

### Date of birth, not age

Stored as a date so it never goes stale. `ageOn()` derives age when needed.

### Weight goes to `body_metrics`, not `profiles`

The first weigh-in is just the first row of the weight history, and doubles as
the BMI input for the safety filters. Height stays on `profiles` because it
does not change.

### `completeOnboarding` re-validates server-side

It re-reads the profile and refuses if anything required is missing, naming
what. A client that skips ahead cannot mark itself done.

### The wizard takes its action layer as a prop

`OnboardingFlow` accepts an optional `actions: OnboardingActions`, defaulting
to the real server actions. This exists because the flow cannot otherwise be
exercised without a Google session — `src/app/dev/onboarding` injects stubs and
renders the real component. It also makes the flow unit-testable later.

The harness is gated twice: the proxy only treats `/dev` as public in
development, and the page calls `notFound()` outside development.

Because the harness has no session and `equipment` is `select to
authenticated`, the catalogue query returns empty there — the dev page falls
back to a representative hardcoded list so the step stays reviewable.

### The progress denominator assumes a physical track

`trainsPhysically` treats a **null** track as physical. Without this the bar
reads "1/7" and then jumps to "7/9" when the user picks gym — a progress
indicator that grows mid-flow looks broken. Shrinking for the yoga minority is
the lesser evil.

### First block is built before onboarding is marked complete

`completeOnboarding` calls `createBlockForUser` and only sets
`onboarding_completed_at` if it succeeded, so a user never lands on Today with
a finished profile and no plan.

## Verification performed

- All nine screens driven end to end in the dev harness, plus the seven-step
  yoga branch. Progressive disclosure on "At home", the yoga-mix arithmetic
  ("3 training + 1 yoga"), equipment category grouping and the injury
  current/past toggle all confirmed.
- Data layer verified against the live database with a throwaway user: every
  write onboarding performs is accepted under RLS, and that user could neither
  read another profile nor forge a row for one.
- **The real signed-in flow — server actions under an actual session — was
  confirmed by Dhananjay on a device, not from here.**

## Known gaps

- No way to revisit onboarding answers yet; a Settings screen is still to come.
  "Rebuild this block" on Today is the current workaround for changed inputs.
- Injury notes are captured in the schema but not exposed in the UI.
- The harness proves layout and interaction only, never the server actions.

## Change log

- Initial nine-step flow with per-step persistence and resume.
- Fixed the progress denominator growing mid-flow.
- Added an explanatory note when the equipment catalogue fails to load.
- Wired first-block generation into `completeOnboarding`.
- **2026-09-13.** QA pass 2: `SPLIT_BY_DAYS` gained entries for 1 and 2 training days — the fallback had been rendering "Full body, 1 times a week" on the yoga-days step. See [17](17-qa-pass-2.md).
