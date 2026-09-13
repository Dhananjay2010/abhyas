# 11 — Block rollover

## What this delivers

Four-week blocks that roll over on their own, carrying the main lifts across so
progression is not thrown away, and streaks that survive the boundary.

## Files

| File | Role |
|---|---|
| `src/lib/program/rollover.ts` | `ensureCurrentBlock`, `extractCarryOver` |
| `src/lib/program/generate.ts` | `carryOver` input, `CARRY_OVER_SLOTS` |
| `src/lib/program/persist.ts` | `createBlockForUser(…, { carryOver })` |
| `src/lib/progress/streaks.ts` | `buildDayRecords` across every block |
| `src/app/today/page.tsx` | Calls `ensureCurrentBlock` on load |

## How rollover happens

`ensureCurrentBlock` runs on every Today page load. While the active block still
covers today it is a cheap no-op; once `ends_on` has passed it builds the next
block and Today shows a banner saying what carried over.

No cron, no background job. For an app this size, rolling over the moment the
user next opens it is simpler and has no failure mode where a job silently stops.

### Concurrency

Two simultaneous requests could both see an expired block. The partial unique
index `programs_one_active_per_user` makes that safe: the second insert fails,
and `ensureCurrentBlock` responds by re-reading the active program rather than
surfacing a spurious error. **Verified** — a second active block is rejected by
the index.

## Carry-over

`SPEC.md` section 6: main compound lifts carry over between blocks because that
is where progress lives; accessories rotate for variety.

`extractCarryOver` reads the first `CARRY_OVER_SLOTS` (2) exercises of each day
from the finishing block, keeps only the **compounds**, and maps them
`${day_index}:${movement_pattern}` → exercise id. The generator consults that
map when filling the first two slots of a day.

### Keyed by day index, not day label

This was found by a test asserting every carried lift reappears — only half did.
A 4-day split is Upper / Lower / **Upper** / Lower, so labels repeat: both Upper
days collided on one key, and the second could not carry its own main lift.
Keying on `day_index` fixed it, taking carried lifts from 4 to 8.

### Carry-over cannot bypass a safety filter

A carried exercise is only reused if it is still in the eligible pool, so a lift
that a new injury now rules out is dropped rather than preserved. There is a
test for exactly this.

### Scoping is an explicit id filter, not an embedded one

The first version filtered on an embedded resource
(`program_days!inner(...)` plus `.eq("program_days.program_id", …)`). Two
problems: the `programId` argument was initially unused entirely — caught by the
linter — and PostgREST accepts the embedded filter both with and without
`!inner`, with different behaviour, which is easy to get subtly wrong and I
could not prove either way from here.

It now fetches the target block's `program_days` ids and filters
`program_day_id` with a plain `.in(...)`. **Verified against real data:** with
two blocks for one user, the scoped query returns 1 row where an unscoped one
returns 2.

## Streaks across blocks

Previously streaks were computed only from the active block's start date, so
finishing a block reset the number to zero — punishing the user for the app's
own bookkeeping. `buildDayRecords` now walks every program the user has had,
attributing each date to whichever block covers it (falling back to the most
recent block that had already started), and builds one record per day from the
earliest block start to today.

## Verification performed

**Generator (`npm run test:generator`)**, five new checks:

- Block 1 yields 8 main lifts to carry
- All 8 reappear in block 2
- 7 of 14 accessories rotate
- No exercise repeats within the new block
- A carried lift that a new injury contraindicates is dropped

**Streaks (`npm run test:streaks`)**, five new checks: a streak of 5 carries
across a block boundary, every day between is accounted for, a date inside
block 2 uses block 2's schedule, dates past a block's end still get a schedule,
and no programs yields no records.

**Database:** scoping proven (1 row vs 2 unscoped), expiry detected, second
active block blocked by the unique index.

## Known gaps

- **Rollover has never fired for real.** It is verified through the pure
  functions and SQL-level conditions, but no block has actually reached four
  weeks on a live account, so the end-to-end path is untested.
- Rollover happens only when Today is opened. Someone who does not open the app
  for a fortnight rolls over on their next visit, not on the calendar date — the
  new block then starts from that day.
- The finishing block is left `completed` with its original `ends_on`, so a long
  absence leaves a gap in the day records where no block covers the dates. The
  fallback attributes those days to the most recent started block, which is a
  guess.
- Deload remains week 4 of every block; there is no logic to skip or extend it
  based on how the block actually went.

## Change log

- Initial rollover, carry-over and cross-block streaks.
- **2026-09-13.** Rollover is now the only path that starts a new block. A rebuild re-plans the block you are in, keeping its number and dates, so the deload week stays where it was going to land. See [19](19-qa-pass-2-remainder.md).
