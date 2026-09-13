# 10 — Settings and history

## What this delivers

A Settings screen covering everything in `SPEC.md` section 13, a History list
with per-session detail, and the four-tab bottom nav the spec calls for.

## Files

| File | Role |
|---|---|
| `src/app/settings/page.tsx` | Loads profile, settings, equipment, injuries |
| `src/app/settings/settings-form.tsx` | The form (client) |
| `src/app/settings/actions.ts` | Four update actions |
| `src/app/history/page.tsx` | Session list |
| `src/app/history/[id]/page.tsx` | Session detail with every logged set |
| `src/components/session-row.tsx` | Shared row, used by the page and the harness |
| `src/components/bottom-nav.tsx` | Today · Breathe · History · Progress · Settings (Breathe added in step 16) |
| `src/app/dev/settings`, `src/app/dev/history` | Development-only harnesses |

## Settings

Grouped so the consequences are obvious:

**Your training** — goal, level, where you train, days per week, yoga days.
**Equipment** — the same checklist as onboarding, with the "everything" shortcut.
**Injuries** — region chips with a current/past toggle.
**During a session** — planning mode, per-set logging, resume, cool-down, rest
timer auto-start / sound / vibration, rest length override, session length.
**Reminders** — weigh-in cadence. Breathing session length used to be here; since
step 16 it lives in the Breathe tab with the other breathing preferences, and
this section links there.

### Changes save immediately; plan changes only *offer* a rebuild

Every control writes as soon as it is touched — there is no Save button to
forget. But a change that alters what the generator would produce (goal, level,
track, days, yoga days, equipment, injuries) does **not** silently rebuild the
block underneath the user. It raises a banner offering a rebuild, and says
plainly that history is preserved.

`SPEC.md` section 13 says these changes regenerate the block "with a
confirmation" — this is that confirmation. Quietly replacing someone's plan
mid-week because they corrected their level would be hostile.

Session preferences deliberately do **not** raise the banner: they change how a
session runs, not what is in it.

### Yoga days are clamped to the training days available

Lowering days per week re-renders the yoga options and clamps the current
selection, so at least one day a week is always training. The server validates
this too — the client is not trusted with it.

### Two settings are shown as not built

Light theme and imperial units are in the spec but not implemented. Rather than
ship dead controls, Settings names them in a "Not built yet" section. The whole
palette is dark-only, and the chart hue was validated against the dark surface
specifically, so a light theme is real work rather than a toggle.

## History

The list shows date, day label, status, deload marker, duration, set count and
volume — with each detail omitted when it does not apply, so a yoga session does
not read "0 sets · 0 kg" and a skipped one shows no duration.

Volume comes from the `session_volume` view added in step 09, so the list does
not have to sum sets client-side.

The detail page shows every exercise with its logged sets, whether it was
skipped, whether it was swapped in, and how it felt.

Breathing is shown differently since step 16:

- **The row** is named after the practice and reads "Breathing · m:ss · N
  breaths".
- **The detail page** (`breathing-detail.tsx`) shows time, breaths, sound, the
  check-in and whether it ended early, instead of a workout page with no sets.

## Verification performed

Through the development harnesses at 375px:

- Settings renders all sections; six toggles present and switching.
- **A session preference does not raise the stale-plan banner; a goal change
  does** — the distinction that matters most here.
- Yoga clamping: with 4 days and 3 yoga selected, dropping to 3 days re-rendered
  the options as 0–2 and moved the selection to 2.
- History rows render correctly for all five statuses, with details correctly
  omitted.
- The four-tab nav fits at 375px: 94px per tab, no wrapping, active tab marked
  with `aria-current`.

## Known gaps

- **The session detail page has not been looked at** — it needs real session
  data to render anything, and no session has been completed on a real account
  yet. Typecheck and build pass; that is all.
- None of this is verified against a signed-in account; the harnesses stub
  persistence.
- `bodyweight_prompt` is now settable but still nothing prompts.
- `preferred_session_minutes` is stored and settable but the session runner does
  not yet use it to size the workout.
- Safety-filter overrides from `SPEC.md` section 13 are not exposed; the
  `safety_overrides` column exists and is unused.
- History has no filtering or pagination beyond the most recent 60 sessions.
- Deleting an account is still not possible from the UI.

## Change log

- Initial Settings and History, four-tab nav, shared `SessionRow`.
- 2026-09-12 (step 16): a fifth tab, Breathe. Breathing session length moved
  out of Settings. History names breathing practices and has a breathing
  detail page.
- **2026-09-13.** QA pass 2: `updateSessionSettings` upserts instead of updating — a plain update against a missing `user_settings` row changed nothing and reported success, so every toggle appeared to save and then reverted. See [17](17-qa-pass-2.md).
- **2026-09-13.** A session's history shows a hold in seconds rather than reps. See [18](18-timed-exercises-and-tomorrow.md).
