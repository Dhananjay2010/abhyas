# QA pass 2 — 2026-09-13 — the whole app except Breathe

> In progress. A full end-to-end pass as a brand new user, against
> **production** (https://abhyas-indol.vercel.app) with a real signed-in
> account, which is what the [first QA pass](QA-FINDINGS.md) could not do.
> Breathe was excluded at Dhananjay's request — he has tested it thoroughly.

## How this was tested

The account for `dhananjay.rtr@gmail.com` was wiped in Supabase (all rows in
every user table, `profiles` reset to a blank onboarding), so onboarding ran
from the first screen exactly as a new signup would. Everything below was then
driven through the real UI in Chrome against production: real Google session,
real server actions, real database.

Two things were exercised outside the browser, and both are named as such where
they appear:

- `scripts/qa/repro-week.ts` and `scripts/qa/repro-pools.ts` run the **real**
  `generateProgram` / `isEligible` against the committed catalogue export, to
  see all seven days of a week at once. Today only ever renders one day, so
  there is no way to inspect the rest of the block through the UI. The
  generated day-7 output was checked against what production actually built
  for the same profile, and matched in structure, so the harness is faithful.
- The set-logging race conditions were re-tested with `window.fetch` wrapped to
  add 1500 ms to every POST, reproducing the slow-server conditions under which
  the original H1 was found.

**Not covered:** real iOS Safari (wake lock, vibration, audio unlock, PWA
install), which SPEC §15 calls mandatory and which cannot be done from here;
the Google OAuth screens; and the Breathe tab.

---

## Verified fixed from the first pass

Re-tested against the real server, not the `/dev` harnesses:

| | |
|---|---|
| **H1 / H2** — double-tap loses a set | **Fixed.** Three rapid taps on "Log set" with POSTs delayed 1500 ms produced exactly one set. Every async button (`Undo`, the three feel buttons, `Skip this exercise`, `End session early`) is `disabled` for the whole round trip. |
| **H3** — `logSet` validates nothing | **Fixed.** `0` reps → "A set needs at least one rep. Skip the set instead." `-50` kg → "Weight cannot be negative." `999` reps → "That is more than 100 reps — please check." `99999` kg → "Weight should be 500 kg or less." |
| **M1** — reps prefilled at top of range | **Fixed for the first set** — the field starts empty with "Enter the reps you did." See F9 for what it does on later sets. |
| **M2** — a logged set cannot be corrected | **Fixed.** "Undo" appears on the most recently logged set and removes it. |
| **M4** — Skip has no confirmation | **Fixed.** "Skip Flutter Kicks? You will not be able to come back to it in this session." |
| Onboarding validation | **Holds.** Under-16 date of birth, a future date of birth, height 320 cm and weight 600 kg are all rejected with specific messages. Continue is disabled until each step is answered. |

Also healthy: the swap flow, the progression messages, the History detail page
(which correctly shows "swapped in", "skipped" and the per-exercise feel), body
weight validation and same-day upsert, and the Settings → "Rebuild my block"
confirmation banner.
